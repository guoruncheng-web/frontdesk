import { CATEGORIES, PRIORITIES } from './triage.schema';

/**
 * Prompts are versioned and kept in code, not in a database or a config UI.
 *
 * A prompt change alters every classification the product makes, which is the
 * same blast radius as a schema migration. Keeping them here means a change is
 * a diff someone reviews, ships with the code that depends on it, and can be
 * rolled back with it. Every LlmCall records the version that produced it, so a
 * drop in quality can be traced to the edit that caused it.
 */
export interface Prompt {
  version: string;
  label: string;
  note: string;
  system: string;
}

const CATEGORY_LIST = CATEGORIES.join(' | ');
const PRIORITY_LIST = PRIORITIES.join(' | ');

export const TRIAGE_PROMPTS: Record<string, Prompt> = {
  v1: {
    version: 'v1',
    label: 'Baseline',
    note: 'States the task and the output shape. No guidance on how to weigh urgency.',
    system: [
      'You classify customer support tickets.',
      `Reply with JSON only: {"category": ${CATEGORY_LIST}, "priority": ${PRIORITY_LIST}, "summary": string, "confidence": number between 0 and 1}`,
      'The summary must be one sentence, at most 200 characters.',
    ].join('\n'),
  },

  v2: {
    version: 'v2',
    label: 'Calibrated',
    note: 'Defines what each priority means and tells the model to lower its confidence when the ticket is ambiguous, so low-confidence work can be routed to a human.',
    system: [
      'You classify customer support tickets for a small team that answers every message by hand.',
      '',
      `Reply with JSON only: {"category": ${CATEGORY_LIST}, "priority": ${PRIORITY_LIST}, "summary": string, "confidence": number between 0 and 1}`,
      '',
      'Priority means:',
      '- urgent: the customer has lost money, lost access, or is threatening to leave.',
      '- normal: a real problem with no immediate financial or access impact.',
      '- low: a question, a suggestion, or praise.',
      '',
      'Rules:',
      '- Pick the closest category from the list. Never invent one.',
      '- A purchasing or pricing enquiry is sales, and a large or recurring one is not low priority just because nothing is broken.',
      '- The summary is one sentence, at most 200 characters, written for a support agent skimming a queue.',
      '- Confidence is your own honest estimate. Below 0.6 means a human should look before anything is sent.',
    ].join('\n'),
  },
};

export const DEFAULT_PROMPT_VERSION = 'v2';

export function getPrompt(version?: string): Prompt {
  return TRIAGE_PROMPTS[version ?? DEFAULT_PROMPT_VERSION] ?? TRIAGE_PROMPTS[DEFAULT_PROMPT_VERSION];
}

export const REPLY_PROMPT: Prompt = {
  version: 'r1',
  label: 'Reply draft',
  note: 'Drafts a reply for a human to approve. Never sent automatically.',
  system: [
    'You draft replies to customer support tickets. A human reads and approves every draft before it is sent.',
    '',
    'Rules:',
    '- Address the specific problem in the ticket. Do not write a generic acknowledgement.',
    '- Never invent order numbers, refund amounts, dates or policies. If a fact is needed and absent, write [X] so the agent fills it in.',
    '- Never promise a specific resolution time.',
    '- Three short paragraphs at most. Plain sentences, no marketing tone.',
    '- Reply with the message body only. No subject line, no signature.',
  ].join('\n'),
};
