import { createHash } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { LlmError } from '../llm/llm.types';
import { AttemptRecord, withRetry } from '../llm/retry';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PROMPT_VERSION, REPLY_PROMPT, getPrompt } from './prompts';
import { TriageResult, describeIssues, extractJson, triageSchema } from './triage.schema';

/**
 * Deliberate failures a visitor can trigger from the UI. Without these the
 * retry logic, the schema repair and the backoff are invisible — a demo where
 * everything always works proves nothing about what happens when it doesn't.
 */
export type Fault = 'none' | 'malformed_output' | 'rate_limit';

interface TriageOptions {
  promptVersion?: string;
  fault?: Fault;
  /** Bypasses the cache so a visitor can watch the same ticket run twice. */
  noCache?: boolean;
  onToken?: (token: string) => void;
  onAttempt?: (record: AttemptRecord) => void;
}

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async triage(organizationId: string, ticketId: string, options: TriageOptions = {}) {
    const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, organizationId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const promptVersion = options.promptVersion ?? DEFAULT_PROMPT_VERSION;
    const prompt = getPrompt(promptVersion);
    const userMessage = `Subject: ${ticket.subject}\nFrom: ${ticket.senderName} <${ticket.senderEmail}>\n\n${ticket.body}`;
    const inputHash = hashInput(prompt.system, userMessage, this.llm.providerName);

    if (!options.noCache && options.fault !== 'malformed_output') {
      const cached = await this.replayFromCache(organizationId, ticket.id, inputHash, promptVersion, options);
      if (cached) return cached;
    }

    let attempts = 0;
    let lastRaw = '';

    const parsed = await withRetry<TriageResult>(
      async (attempt) => {
        attempts = attempt;

        // A repair attempt shows the model its own output and the exact
        // complaint. Re-asking the original question instead usually produces
        // the same mistake, because nothing told it what was wrong.
        const messages =
          attempt > 1 && lastRaw
            ? [
                { role: 'system' as const, content: prompt.system },
                { role: 'user' as const, content: userMessage },
                { role: 'assistant' as const, content: lastRaw },
                {
                  role: 'user' as const,
                  content: `That response was rejected: ${this.lastIssue ?? 'it was not valid JSON'}. Reply again with valid JSON only, nothing else.`,
                },
              ]
            : [
                { role: 'system' as const, content: prompt.system },
                { role: 'user' as const, content: userMessage },
              ];

        if (options.fault === 'rate_limit' && attempt === 1) {
          await this.record(organizationId, ticket.id, {
            purpose: 'triage',
            promptVersion,
            attempt,
            outcome: 'rate_limited',
            inputHash,
            error: 'Simulated 429 from the provider',
          });
          throw new LlmError('rate_limited', 'Simulated rate limit', 900);
        }

        const result = await this.llm.complete({
          messages,
          onToken: options.onToken,
          // The repair attempt must not stream into the UI as if it were the
          // first answer; the caller only wants to watch the successful pass.
          ...(attempt > 1 ? { onToken: undefined } : {}),
        });

        lastRaw =
          options.fault === 'malformed_output' && attempt === 1
            ? corrupt(result.text)
            : result.text;

        const validated = validate(lastRaw);

        await this.record(organizationId, ticket.id, {
          purpose: 'triage',
          promptVersion,
          attempt,
          outcome: validated.ok ? 'ok' : 'invalid_output',
          inputHash,
          response: lastRaw,
          result,
          error: validated.ok ? undefined : validated.issue,
        });

        if (!validated.ok) {
          this.lastIssue = validated.issue;
          throw new LlmError('invalid_output', validated.issue);
        }

        return validated.value;
      },
      {
        onAttempt: options.onAttempt,
        // The next attempt is not the same request: it carries the rejected
        // output and the reason, so a schema failure is genuinely worth
        // retrying here even though the default policy refuses to.
        isRetryable: (error) => error instanceof LlmError,
      },
    );

    return this.persist(ticket.id, parsed, promptVersion, attempts);
  }

  /** Drafts a reply for a human to approve. Nothing here sends anything. */
  async draftReply(organizationId: string, ticketId: string, onToken?: (token: string) => void) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, organizationId },
      include: { triage: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const context = ticket.triage
      ? `Category: ${ticket.triage.category}. Priority: ${ticket.triage.priority}.\n\n`
      : '';

    const result = await this.llm.complete({
      messages: [
        { role: 'system', content: REPLY_PROMPT.system },
        { role: 'user', content: `${context}Subject: ${ticket.subject}\n\n${ticket.body}` },
      ],
      maxTokens: 500,
      temperature: 0.3,
      onToken,
    });

    await this.record(organizationId, ticket.id, {
      purpose: 'reply',
      promptVersion: REPLY_PROMPT.version,
      attempt: 1,
      outcome: 'ok',
      inputHash: hashInput(REPLY_PROMPT.system, ticket.body, this.llm.providerName),
      response: result.text,
      result,
    });

    return this.prisma.draft.upsert({
      where: { ticketId: ticket.id },
      create: { ticketId: ticket.id, body: result.text },
      update: { body: result.text, approvedAt: null },
    });
  }

  private lastIssue: string | undefined;

  /**
   * Serves an identical earlier request from its recorded response.
   *
   * The same ticket re-triaged with the same prompt is the same question, and
   * paying for it twice is the easiest money to stop spending. The saved cost
   * is reported rather than hidden, because "why is the bill this size" is the
   * question every client asks second.
   */
  private async replayFromCache(
    organizationId: string,
    ticketId: string,
    inputHash: string,
    promptVersion: string,
    options: TriageOptions,
  ) {
    const hit = await this.prisma.llmCall.findFirst({
      where: { organizationId, inputHash, outcome: 'ok', purpose: 'triage', response: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    if (!hit?.response) return null;

    const candidate = triageSchema.safeParse(extractJson(hit.response));
    if (!candidate.success) return null;

    options.onToken?.(hit.response);

    await this.prisma.llmCall.create({
      data: {
        organizationId,
        ticketId,
        purpose: 'triage',
        provider: hit.provider,
        model: hit.model,
        promptVersion,
        attempt: 1,
        outcome: 'ok',
        inputHash,
        cacheHit: true,
        // A cache hit costs nothing; recording it at zero is what makes the
        // savings visible on the cost panel.
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 0,
        latencyMs: 0,
        response: hit.response,
      },
    });

    return this.persist(ticketId, candidate.data, promptVersion, 1);
  }

  private async persist(ticketId: string, result: TriageResult, promptVersion: string, attempts: number) {
    const triage = await this.prisma.triage.upsert({
      where: { ticketId },
      create: { ticketId, ...result, promptVersion, attempts },
      update: { ...result, promptVersion, attempts },
    });

    await this.prisma.ticket.update({ where: { id: ticketId }, data: { status: 'triaged' } });

    return triage;
  }

  private async record(
    organizationId: string,
    ticketId: string,
    entry: {
      purpose: string;
      promptVersion: string;
      attempt: number;
      outcome: string;
      inputHash: string;
      response?: string;
      error?: string;
      result?: { model: string; provider: string; inputTokens: number; outputTokens: number; costMicros: number; latencyMs: number; ttfbMs: number | null };
    },
  ) {
    await this.prisma.llmCall.create({
      data: {
        organizationId,
        ticketId,
        purpose: entry.purpose,
        provider: entry.result?.provider ?? this.llm.providerName,
        model: entry.result?.model ?? 'unknown',
        promptVersion: entry.promptVersion,
        attempt: entry.attempt,
        outcome: entry.outcome,
        inputHash: entry.inputHash,
        inputTokens: entry.result?.inputTokens ?? 0,
        outputTokens: entry.result?.outputTokens ?? 0,
        costMicros: entry.result?.costMicros ?? 0,
        latencyMs: entry.result?.latencyMs ?? 0,
        ttfbMs: entry.result?.ttfbMs ?? null,
        response: entry.response,
        error: entry.error,
      },
    });
  }
}

type Validation =
  | { ok: true; value: TriageResult }
  | { ok: false; issue: string };

/** Parses and checks one model response, describing the problem if there is one. */
function validate(raw: string): Validation {
  let candidate: unknown;

  try {
    candidate = extractJson(raw);
  } catch (error) {
    return { ok: false, issue: (error as Error).message };
  }

  const parsed = triageSchema.safeParse(candidate);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, issue: describeIssues(parsed.error) };
}

function hashInput(system: string, user: string, provider: string): string {
  return createHash('sha256').update(`${provider} ${system} ${user}`).digest('hex');
}

/** Breaks the model's JSON the way a truncated stream would, for the fault demo. */
function corrupt(text: string): string {
  return text.replace(/":\s*"/, '"');
}
