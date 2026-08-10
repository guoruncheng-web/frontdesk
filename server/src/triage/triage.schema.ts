import { z } from 'zod';

/**
 * The categories the product actually supports.
 *
 * This has to be a closed set, and it has to be enforced after the model
 * answers. Asked the same question six times, the model returned "billing"
 * five times and "billing_and_payments" once — same meaning, different string.
 * A free-text column collects every synonym the model ever invents, and then
 * no report over that column is trustworthy again.
 */
export const CATEGORIES = [
  'billing',
  'technical',
  'account',
  'shipping',
  'refund',
  'feedback',
  /// A support inbox receives leads too. Without somewhere to put them, a
  /// request for quarterly pricing on 200 units lands in `other` at low
  /// priority — the most valuable message in the queue, filed last.
  'sales',
  'other',
] as const;

export const PRIORITIES = ['low', 'normal', 'urgent'] as const;

export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];

export const triageSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  summary: z.string().min(1).max(280),
  confidence: z.number().min(0).max(1),
});

export type TriageResult = z.infer<typeof triageSchema>;

/**
 * Pulls the JSON object out of a model response.
 *
 * Even told to answer with JSON only, models wrap it in ```json fences or add a
 * sentence of preamble often enough that refusing to parse those is just
 * throwing away good answers. Anything past that is a real failure and should
 * be reported as one rather than papered over.
 */
export function extractJson(raw: string): unknown {
  const withoutFence = raw
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    // Fall through to locating the outermost object.
  }

  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');

  if (start === -1 || end <= start) {
    throw new SyntaxError('No JSON object found in model output');
  }

  return JSON.parse(withoutFence.slice(start, end + 1));
}

/** Formats validation problems in a way the model can act on when asked to fix them. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}
