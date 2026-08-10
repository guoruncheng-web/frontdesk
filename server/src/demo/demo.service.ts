import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth/auth.service';
import { AuthResponseDto } from '../auth/dto/auth.dto';
import { PrismaService } from '../prisma/prisma.service';
import { DEMO_ORGANIZATION_NAME, DEMO_OWNER_NAME, DEMO_TICKETS } from './demo-dataset';

const SANDBOX_TTL_HOURS = 24;

/**
 * Ceiling on live sandboxes. Each one costs real money the moment its tickets
 * are triaged, so the cap matters more here than it did in a CRM demo: an
 * unauthenticated endpoint that provisions LLM work is an invitation.
 */
const MAX_LIVE_SANDBOXES = 150;

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Mints a private inbox and signs the visitor into it.
   *
   * Tickets arrive untriaged on purpose. The first thing a visitor does is
   * press the button and watch the classification stream in — showing them a
   * finished board would hide the entire product.
   */
  async createSandbox(): Promise<AuthResponseDto> {
    await this.reap();

    const id = randomUUID();

    const user = await this.prisma.user.create({
      data: {
        email: `demo-${id}@sandbox.frontdesk.app`,
        name: DEMO_OWNER_NAME,
        passwordHash: await bcrypt.hash(randomUUID(), 10),
        organization: { create: { name: DEMO_ORGANIZATION_NAME, isDemo: true } },
      },
      include: { organization: true },
    });

    const now = Date.now();

    await this.prisma.ticket.createMany({
      data: DEMO_TICKETS.map((ticket) => ({
        organizationId: user.organizationId,
        senderName: ticket.senderName,
        senderEmail: ticket.senderEmail,
        subject: ticket.subject,
        body: ticket.body,
        channel: ticket.channel,
        receivedAt: new Date(now - ticket.hoursAgo * 3_600_000),
      })),
    });

    return this.auth.issueToken(user);
  }

  /**
   * Deletes expired sandboxes, then trims the oldest if the cap is still
   * exceeded. Runs inline rather than on a schedule because the Hobby plan
   * allows one cron trigger a day, and the delete is a single indexed
   * statement. `organizations` cascades to everything below it.
   */
  private async reap(): Promise<void> {
    const cutoff = new Date(Date.now() - SANDBOX_TTL_HOURS * 3_600_000);

    try {
      const { count } = await this.prisma.organization.deleteMany({
        where: { isDemo: true, createdAt: { lt: cutoff } },
      });

      if (count > 0) this.logger.log(`Reaped ${count} expired sandbox(es)`);

      const live = await this.prisma.organization.count({ where: { isDemo: true } });
      if (live < MAX_LIVE_SANDBOXES) return;

      const surplus = await this.prisma.organization.findMany({
        where: { isDemo: true },
        orderBy: { createdAt: 'asc' },
        take: live - MAX_LIVE_SANDBOXES + 1,
        select: { id: true },
      });

      await this.prisma.organization.deleteMany({
        where: { id: { in: surplus.map((organization) => organization.id) } },
      });

      this.logger.warn(`Sandbox cap reached; trimmed ${surplus.length}`);
    } catch (error) {
      // Cleanup failing is not a reason to deny someone a demo.
      this.logger.error('Sandbox cleanup failed', error as Error);
    }
  }
}
