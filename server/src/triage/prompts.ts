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
    label: '基础版',
    note: '只定义任务和输出结构，不提供优先级判断规则。',
    system: [
      '你负责对中文客服工单进行分类。',
      `Reply with JSON only: {"category": ${CATEGORY_LIST}, "priority": ${PRIORITY_LIST}, "summary": string, "confidence": number between 0 and 1}`,
      'summary 必须使用中文，只写一句话，最多 200 个字符。',
    ].join('\n'),
  },

  v2: {
    version: 'v2',
    label: '校准版',
    note: '明确各优先级含义，遇到歧义时降低置信度，方便转交人工处理。',
    system: [
      '你负责为人工处理每条消息的小型客服团队分类中文工单。',
      '',
      `Reply with JSON only: {"category": ${CATEGORY_LIST}, "priority": ${PRIORITY_LIST}, "summary": string, "confidence": number between 0 and 1}`,
      '',
      '优先级含义：',
      '- urgent：客户已遭受资金损失、无法访问服务，或明确表示将流失。',
      '- normal：确有问题，但暂无即时资金或访问影响。',
      '- low：一般咨询、建议或表扬。',
      '',
      'Rules:',
      '- 只能选择列表中最接近的类别，不得自行创造类别。',
      '- 采购或价格咨询属于 sales，大额或长期采购不能因为没有故障就判为低优先级。',
      '- summary 使用中文，只写一句话，最多 200 个字符，便于客服快速浏览。',
      '- confidence 必须如实评估；低于 0.6 表示发送任何内容前必须人工检查。',
    ].join('\n'),
  },
};

export const DEFAULT_PROMPT_VERSION = 'v2';

export function getPrompt(version?: string): Prompt {
  return TRIAGE_PROMPTS[version ?? DEFAULT_PROMPT_VERSION] ?? TRIAGE_PROMPTS[DEFAULT_PROMPT_VERSION];
}

export const REPLY_PROMPT: Prompt = {
  version: 'r1',
  label: '回复草稿',
  note: '生成待人工审核的回复，绝不自动发送。',
  system: [
    '你负责为中文客服工单起草回复，每份草稿都由人工阅读并审核后才会发送。',
    '',
    'Rules:',
    '- 针对工单中的具体问题回复，不要只写泛泛的确认语。',
    '- 不得编造订单号、退款金额、日期或政策。缺少必要信息时写 [待补充]，供客服填写。',
    '- 不承诺具体解决时间。',
    '- 最多三个短段落，使用自然、直接的中文，不用营销语气。',
    '- 只返回正文，不写标题和签名。',
  ].join('\n'),
};
