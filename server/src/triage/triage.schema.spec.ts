import { extractJson, triageSchema } from './triage.schema';

describe('extractJson', () => {
  it('parses a bare object', () => {
    expect(extractJson('{"category":"billing"}')).toEqual({ category: 'billing' });
  });

  // Models wrap JSON in fences often enough that refusing to parse those would
  // be throwing away correct answers over formatting.
  it('unwraps a fenced block', () => {
    expect(extractJson('```json\n{"category":"billing"}\n```')).toEqual({ category: 'billing' });
  });

  it('unwraps a fence without a language tag', () => {
    expect(extractJson('```\n{"category":"billing"}\n```')).toEqual({ category: 'billing' });
  });

  it('finds the object when the model adds a sentence first', () => {
    expect(extractJson('Sure! Here is the classification:\n{"category":"billing"}')).toEqual({
      category: 'billing',
    });
  });

  it('throws when there is no object at all, rather than inventing one', () => {
    expect(() => extractJson('I cannot classify this ticket.')).toThrow();
  });

  it('throws on a truncated object instead of silently returning a fragment', () => {
    expect(() => extractJson('{"category":"bil')).toThrow();
  });
});

describe('triageSchema', () => {
  const valid = { category: 'billing', priority: 'urgent', summary: 'Charged twice.', confidence: 0.9 };

  it('accepts a well-formed result', () => {
    expect(triageSchema.safeParse(valid).success).toBe(true);
  });

  /**
   * Observed for real: asked the same question six times, the model answered
   * "billing" five times and "billing_and_payments" once. Left to a free-text
   * column both would be stored, and no report grouping by category would be
   * trustworthy again.
   */
  it('rejects a category the model invented', () => {
    expect(triageSchema.safeParse({ ...valid, category: 'billing_and_payments' }).success).toBe(false);
  });

  it('rejects a priority outside the scale', () => {
    expect(triageSchema.safeParse({ ...valid, priority: 'critical' }).success).toBe(false);
  });

  it('rejects confidence outside 0..1', () => {
    expect(triageSchema.safeParse({ ...valid, confidence: 1.4 }).success).toBe(false);
    expect(triageSchema.safeParse({ ...valid, confidence: -0.1 }).success).toBe(false);
  });

  it('rejects an empty summary, which is worse than no classification', () => {
    expect(triageSchema.safeParse({ ...valid, summary: '' }).success).toBe(false);
  });

  it('rejects a summary too long for a queue row', () => {
    expect(triageSchema.safeParse({ ...valid, summary: 'x'.repeat(400) }).success).toBe(false);
  });

  it('rejects a confidence sent as a string, which some models do', () => {
    expect(triageSchema.safeParse({ ...valid, confidence: '0.9' }).success).toBe(false);
  });
});
