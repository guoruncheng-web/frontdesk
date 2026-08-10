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

export const DEMO_ORGANIZATION_NAME = 'Northwind Supply';
export const DEMO_OWNER_NAME = 'Sam Ellis';

export const DEMO_TICKETS: DemoTicket[] = [
  {
    senderName: 'Marta Reyes',
    senderEmail: 'marta.reyes@example.com',
    subject: 'Charged twice for order 44718',
    body: 'My statement shows two charges of $148.00 for order 44718, eleven minutes apart. I only placed one order. I have emailed twice this week and nobody has replied. Please refund the duplicate today or I will dispute it with my bank.',
    channel: 'email',
    hoursAgo: 1,
  },
  {
    senderName: 'Devin Okonkwo',
    senderEmail: 'devin@brightpath.example',
    subject: 'API keys stopped working around 09:15',
    body: 'Every request from our integration has returned 401 since about 09:15 UTC. Nothing changed on our side and the key is not expired according to the dashboard. Our checkout is down. Anything you can tell us would help.',
    channel: 'email',
    hoursAgo: 2,
  },
  {
    senderName: 'Priya Raman',
    senderEmail: 'priya.raman@example.com',
    subject: 'Where is my order?',
    body: 'Tracking has said "label created" for six days. Order 44502. Has it actually shipped? No rush if it is just the carrier being slow, I would just like to know.',
    channel: 'email',
    hoursAgo: 5,
  },
  {
    senderName: 'Tom Blake',
    senderEmail: 'tom.blake@example.com',
    subject: 'THIS IS RIDICULOUS',
    body: 'I have been trying for twenty minutes to find where to change the email address on my account and it is nowhere. Why is this so hard. Just tell me where the button is.',
    channel: 'chat',
    hoursAgo: 6,
  },
  {
    senderName: 'Anneke Visser',
    senderEmail: 'a.visser@example.nl',
    subject: 'Return window question',
    body: 'I bought a desk lamp on the 3rd and it does not fit the space. Your site says 30 days but the receipt says 14. Which one applies? Nothing is wrong with the lamp, it is just the wrong size.',
    channel: 'email',
    hoursAgo: 9,
  },
  {
    senderName: 'Luis Fernandes',
    senderEmail: 'luis.f@example.com',
    subject: 'Invoice needs our VAT number',
    body: 'Finance rejected invoice INV-20881 because our VAT number is missing. Could you reissue it with NL855123456B01 on it? Not urgent, but we cannot pay it until it is corrected.',
    channel: 'email',
    hoursAgo: 14,
  },
  {
    senderName: 'Grace Nolan',
    senderEmail: 'grace.nolan@example.com',
    subject: 'Just wanted to say thanks',
    body: 'Whoever handled my exchange last week was excellent. The replacement arrived faster than the original. No action needed, just wanted someone to know.',
    channel: 'email',
    hoursAgo: 20,
  },
  {
    senderName: 'Karl Bergstrom',
    senderEmail: 'karl@bergstrom.example',
    subject: 'it says error',
    body: 'it says error when i try. been trying since yesterday. please fix',
    channel: 'chat',
    hoursAgo: 26,
  },
  {
    senderName: 'Sofia Marchetti',
    senderEmail: 'sofia.m@example.it',
    subject: 'Cancel my subscription before renewal',
    body: 'My plan renews on the 14th and I need it cancelled before then. I could not find a cancel button in billing settings. Please confirm in writing that it will not renew.',
    channel: 'email',
    hoursAgo: 31,
  },
  {
    senderName: 'Owen Pryce',
    senderEmail: 'owen.pryce@example.com',
    subject: 'Bulk pricing for 200 units?',
    body: 'We are looking at roughly 200 units of the SKU in the attached list, quarterly. Is there a bulk rate, and does it come with a dedicated contact? Happy to jump on a call.',
    channel: 'email',
    hoursAgo: 38,
  },
  {
    senderName: 'Hana Suzuki',
    senderEmail: 'h.suzuki@example.jp',
    subject: 'Package arrived damaged',
    body: 'The box was crushed and the ceramic pieces inside are broken. Order 44190. Photos attached. I would like a replacement rather than a refund if that is possible.',
    channel: 'email',
    hoursAgo: 44,
  },
  {
    senderName: 'Ben Kowalski',
    senderEmail: 'ben.k@example.pl',
    subject: 'Locked out after password reset',
    body: 'I reset my password and now the reset link says it has already been used. Requesting a new one sends nothing. I cannot get into the account at all and there is an order in it I need to change.',
    channel: 'email',
    hoursAgo: 52,
  },
];
