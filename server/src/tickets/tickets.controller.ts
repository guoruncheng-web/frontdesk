import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { CurrentUser as CurrentUserType } from '../auth/jwt.strategy';
import { TRIAGE_PROMPTS } from '../triage/prompts';
import { Fault, TriageService } from '../triage/triage.service';
import { ApproveDraftDto, TriageQueryDto } from './tickets.dto';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly triage: TriageService,
  ) {}

  @Get('tickets')
  @ApiOperation({ summary: 'The inbox, untriaged first' })
  list(@CurrentUser() user: CurrentUserType, @Query('status') status?: string) {
    return this.tickets.list(user.organizationId, status);
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'One ticket with its triage, draft and every model call it caused' })
  get(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.tickets.get(user.organizationId, id);
  }

  @Post('tickets/:id/approve')
  @ApiOperation({ summary: 'Approve a reply draft, using the text as edited by the agent' })
  approve(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveDraftDto,
  ) {
    return this.tickets.approveDraft(user.organizationId, id, dto.body);
  }

  @Get('usage')
  @ApiOperation({ summary: 'What the model calls cost, and what the cache saved' })
  usage(@CurrentUser() user: CurrentUserType) {
    return this.tickets.usage(user.organizationId);
  }

  @Get('prompts')
  @ApiOperation({ summary: 'The prompt versions available to compare' })
  prompts() {
    return Object.values(TRIAGE_PROMPTS).map(({ version, label, note }) => ({ version, label, note }));
  }

  /**
   * Streams a triage run as server-sent events.
   *
   * Streamed rather than returned whole because the interesting part is the
   * middle: the tokens arriving, an attempt being rejected, the wait before the
   * retry. A JSON response that appears a few seconds later shows none of it,
   * and "it retried" becomes a claim the visitor has to take on faith.
   */
  @Post('tickets/:id/triage')
  @ApiOperation({ summary: 'Classify a ticket, streaming tokens and attempts as they happen' })
  async triageTicket(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TriageQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Vercel's proxy buffers responses without this, which turns a stream
      // into a single delivery at the end and defeats the whole point.
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const triage = await this.triage.triage(user.organizationId, id, {
        promptVersion: query.promptVersion,
        fault: (query.fault ?? 'none') as Fault,
        noCache: query.noCache === 'true',
        onToken: (token) => send('token', { token }),
        onAttempt: (record) => send('attempt', record),
      });

      send('done', triage);
    } catch (error) {
      send('failed', { message: (error as Error).message });
    } finally {
      res.end();
    }
  }

  @Post('tickets/:id/draft')
  @ApiOperation({ summary: 'Draft a reply, streaming it as it is written' })
  async draft(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const draft = await this.triage.draftReply(user.organizationId, id, (token) =>
        send('token', { token }),
      );
      send('done', { body: draft.body });
    } catch (error) {
      send('failed', { message: (error as Error).message });
    } finally {
      res.end();
    }
  }
}
