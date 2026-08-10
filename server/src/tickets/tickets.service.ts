import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The queue, newest first.
   *
   * Sorting untriaged tickets to the top reads well until you triage one: it
   * jumps to the bottom of the list while you are still looking at it, and the
   * row you selected vanishes. An inbox that reorders itself under the reader
   * is worse than one that makes them scan, and the priority bar down the edge
   * already makes scanning cheap.
   */
  async list(organizationId: string, status?: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      include: { triage: true, draft: true },
      orderBy: { receivedAt: 'desc' },
    });

    return tickets.map(toDto);
  }

  async get(organizationId: string, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, organizationId },
      include: { triage: true, draft: true, llmCalls: { orderBy: { createdAt: 'asc' } } },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    return {
      ...toDto(ticket),
      body: ticket.body,
      calls: ticket.llmCalls.map((call) => ({
        id: call.id,
        purpose: call.purpose,
        attempt: call.attempt,
        outcome: call.outcome,
        promptVersion: call.promptVersion,
        model: call.model,
        cacheHit: call.cacheHit,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        costMicros: call.costMicros,
        latencyMs: call.latencyMs,
        ttfbMs: call.ttfbMs,
        error: call.error,
        createdAt: call.createdAt.toISOString(),
      })),
    };
  }

  async approveDraft(organizationId: string, ticketId: string, body: string) {
    const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, organizationId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    // The edited text is what gets approved, not the model's original. An agent
    // who fixes a draft and then watches the unedited version go out will not
    // use the tool twice.
    const draft = await this.prisma.draft.upsert({
      where: { ticketId },
      create: { ticketId, body, approvedAt: new Date() },
      update: { body, approvedAt: new Date() },
    });

    await this.prisma.ticket.update({ where: { id: ticketId }, data: { status: 'replied' } });

    return draft;
  }

  /**
   * What the run cost and what the cache saved.
   *
   * "How much will this cost me per month" is the second question every client
   * asks about an AI feature, and a demo that cannot answer it has not really
   * shown the feature working.
   */
  async usage(organizationId: string) {
    const calls = await this.prisma.llmCall.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    const spentMicros = calls.reduce((total, call) => total + call.costMicros, 0);
    const cacheHits = calls.filter((call) => call.cacheHit);

    // A cache hit's saving is what an equivalent live call cost, so price it
    // from the real calls rather than from a made-up average.
    const paid = calls.filter((call) => !call.cacheHit && call.outcome === 'ok');
    const averageMicros = paid.length
      ? Math.round(paid.reduce((total, call) => total + call.costMicros, 0) / paid.length)
      : 0;

    const retries = calls.filter((call) => call.attempt > 1).length;
    const failures = calls.filter((call) => call.outcome !== 'ok').length;

    return {
      calls: calls.length,
      spentMicros,
      savedMicros: cacheHits.length * averageMicros,
      cacheHits: cacheHits.length,
      retries,
      failures,
      inputTokens: calls.reduce((total, call) => total + call.inputTokens, 0),
      outputTokens: calls.reduce((total, call) => total + call.outputTokens, 0),
      recent: calls.slice(0, 12).map((call) => ({
        id: call.id,
        purpose: call.purpose,
        outcome: call.outcome,
        attempt: call.attempt,
        cacheHit: call.cacheHit,
        costMicros: call.costMicros,
        latencyMs: call.latencyMs,
        promptVersion: call.promptVersion,
        createdAt: call.createdAt.toISOString(),
      })),
    };
  }
}

function toDto(ticket: {
  id: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
  channel: string;
  status: string;
  receivedAt: Date;
  triage?: { category: string; priority: string; summary: string; confidence: number; promptVersion: string; attempts: number } | null;
  draft?: { body: string; approvedAt: Date | null } | null;
}) {
  return {
    id: ticket.id,
    senderName: ticket.senderName,
    senderEmail: ticket.senderEmail,
    subject: ticket.subject,
    preview: ticket.body.slice(0, 140),
    channel: ticket.channel,
    status: ticket.status,
    receivedAt: ticket.receivedAt.toISOString(),
    triage: ticket.triage
      ? {
          category: ticket.triage.category,
          priority: ticket.triage.priority,
          summary: ticket.triage.summary,
          confidence: ticket.triage.confidence,
          promptVersion: ticket.triage.promptVersion,
          attempts: ticket.triage.attempts,
        }
      : null,
    draft: ticket.draft ? { body: ticket.draft.body, approved: ticket.draft.approvedAt !== null } : null,
  };
}
