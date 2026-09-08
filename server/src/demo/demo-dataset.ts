/**
 * The inbox handed to every demo visitor.
 *
 * Written to span the categories and priorities the classifier has to tell
 * apart, including the cases it gets wrong: a furious message that is really
 * just a question, a calm message that is actually an outage, and one that is
 * genuinely ambiguous so a visitor can see confidence drop instead of the model
 * bluffing.
 */
export interface DemoTicket {
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
  channel: string;
  hoursAgo: number;
}

export const DEMO_ORGANIZATION_NAME = '北风供应链';
export const DEMO_OWNER_NAME = '陈晨';

export const DEMO_TICKETS: DemoTicket[] = [
  {
    senderName: '王敏',
    senderEmail: 'marta.reyes@example.com',
    subject: '订单 44718 被重复扣款',
    body: '账单显示订单 44718 被扣了两次 148 元，间隔只有 11 分钟。我只下过一次单，这周已经发了两封邮件都没人回复。请今天退回重复扣款，否则我只能向银行申诉。',
    channel: '邮件',
    hoursAgo: 1,
  },
  {
    senderName: '李哲',
    senderEmail: 'devin@brightpath.example',
    subject: 'API 密钥从 09:15 起无法使用',
    body: '大约从 09:15 开始，我们集成发出的所有请求都返回 401。我们没有改过配置，控制台也显示密钥未过期，现在结账流程已中断，请尽快协助。',
    channel: '邮件',
    hoursAgo: 2,
  },
  {
    senderName: '赵妍',
    senderEmail: 'priya.raman@example.com',
    subject: '我的订单发货了吗？',
    body: '订单 44502 的物流已经连续六天显示“已创建运单”，请问实际发货了吗？如果只是物流更新慢也不着急，我想确认一下进度。',
    channel: '邮件',
    hoursAgo: 5,
  },
  {
    senderName: '周海',
    senderEmail: 'tom.blake@example.com',
    subject: '修改邮箱的入口到底在哪里？',
    body: '我找了二十分钟都没找到修改账号邮箱的地方，为什么这么难用？请直接告诉我按钮在哪里。',
    channel: '在线聊天',
    hoursAgo: 6,
  },
  {
    senderName: '陈琳',
    senderEmail: 'a.visser@example.nl',
    subject: '咨询退货期限',
    body: '我 3 号买的台灯尺寸不合适。网站写的是 30 天内可退，但小票上写 14 天，请问以哪个为准？台灯没有质量问题，只是尺寸不合适。',
    channel: '邮件',
    hoursAgo: 9,
  },
  {
    senderName: '刘畅',
    senderEmail: 'luis.f@example.com',
    subject: '发票需要补充税号',
    body: '财务退回了发票 INV-20881，因为缺少我司税号。能否补上 NL855123456B01 后重新开具？不紧急，但修改前我们无法付款。',
    channel: '邮件',
    hoursAgo: 14,
  },
  {
    senderName: '孙悦',
    senderEmail: 'grace.nolan@example.com',
    subject: '感谢你们的处理',
    body: '上周帮我处理换货的客服非常专业，替换商品甚至比原订单更快送到。不需要跟进，只想表达感谢。',
    channel: '邮件',
    hoursAgo: 20,
  },
  {
    senderName: '郑强',
    senderEmail: 'karl@bergstrom.example',
    subject: '操作时一直报错',
    body: '每次操作都提示错误，从昨天开始一直这样，麻烦修一下。',
    channel: '在线聊天',
    hoursAgo: 26,
  },
  {
    senderName: '何倩',
    senderEmail: 'sofia.m@example.it',
    subject: '请在续费前取消订阅',
    body: '我的套餐将在 14 号续费，需要在此之前取消。账单设置里找不到取消按钮，请书面确认不会继续扣费。',
    channel: '邮件',
    hoursAgo: 31,
  },
  {
    senderName: '高远',
    senderEmail: 'owen.pryce@example.com',
    subject: '采购 200 件是否有批量价格？',
    body: '我们计划每季度采购附件清单中的 SKU，大约 200 件。请问是否有批量价格和专属对接人？方便的话可以电话沟通。',
    channel: '邮件',
    hoursAgo: 38,
  },
  {
    senderName: '林雨',
    senderEmail: 'h.suzuki@example.jp',
    subject: '包裹到货时已破损',
    body: '订单 44190 的外箱被压坏，里面的陶瓷件也碎了，照片见附件。如果可以，我希望补发而不是退款。',
    channel: '邮件',
    hoursAgo: 44,
  },
  {
    senderName: '马超',
    senderEmail: 'ben.k@example.pl',
    subject: '重置密码后无法登录',
    body: '重置密码后，链接提示已经使用过；重新申请又收不到邮件。我现在完全无法登录，账号里还有一张订单急需修改。',
    channel: '邮件',
    hoursAgo: 52,
  },
];
