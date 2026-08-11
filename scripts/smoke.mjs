#!/usr/bin/env node
/**
 * Smoke test against a running deployment.
 *
 * The unit suites stub the network, which is the right trade for them but means
 * nothing in the repository proves the deployed thing works. This does: it
 * mints a sandbox on the live API and walks the promises the README makes —
 * caching, fault recovery, prompt versions, human approval — asserting on what
 * comes back.
 *
 * It is not in CI, because every run spends real model credit (about $0.001)
 * and CI runs on every push. Run it after a deploy.
 *
 *   node scripts/smoke.mjs                              # production
 *   node scripts/smoke.mjs http://localhost:8080/api    # a local server
 */

const BASE = (process.argv[2] ?? 'https://frontdesk-api.vercel.app/api').replace(/\/$/, '');

let token;
let failures = 0;

function check(label, ok, detail) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function call(path, { method = 'GET', body } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/**
 * Collects a server-sent stream into the events it carried.
 *
 * Reads the whole body rather than streaming it: this asserts on the outcome,
 * and whether the tokens arrive progressively is what the browser demonstrates.
 */
async function stream(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${BASE}${path}${query ? `?${query}` : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });

  if (!response.ok) throw new Error(`POST ${path} → ${response.status}`);

  const collected = { tokens: 0, attempts: [], done: null, failed: null };

  for (const block of (await response.text()).split('\n\n')) {
    const event = block.match(/^event: (.+)$/m)?.[1];
    const data = block.match(/^data: (.+)$/m)?.[1];
    if (!event || !data) continue;

    const payload = JSON.parse(data);
    if (event === 'token') collected.tokens += 1;
    else if (event === 'attempt') collected.attempts.push(payload);
    else if (event === 'done') collected.done = payload;
    else if (event === 'failed') collected.failed = payload;
  }

  return collected;
}

async function expectStatus(label, path, { method = 'GET', authorized = true } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authorized && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: method === 'POST' ? '{}' : undefined,
  });
  await response.text();
  return response.status;
}

console.log(`Frontdesk smoke test → ${BASE}\n`);

const health = await call('/health');
check('health round-trips the database', health.database === 'up', JSON.stringify(health));

const session = await call('/demo/session', { method: 'POST', body: {} });
token = session.accessToken;
check('a demo session mints its own workspace', Boolean(token) && Boolean(session.user?.organizationId));

const tickets = await call('/tickets');
check('the sandbox is seeded', tickets.length >= 12, `${tickets.length} tickets`);

const [first, second] = tickets;
const usage = () => call('/usage');

// Classifying costs money, and the cost is recorded rather than estimated.
const paid = await stream(`/tickets/${first.id}/triage`);
const afterPaid = await usage();
check(
  'a classification streams and lands a verdict',
  paid.tokens > 0 && paid.done?.category && paid.done?.priority,
  `${paid.tokens} tokens → ${paid.done?.category}/${paid.done?.priority}`,
);
check('the call is billed in micros, not averaged', afterPaid.spentMicros > 0, `${afterPaid.spentMicros}µ$`);

// The same question again should be free, and the saving should be visible.
await stream(`/tickets/${first.id}/triage`);
const afterCached = await usage();
check(
  'the same ticket again is served from cache at zero cost',
  afterCached.cacheHits === afterPaid.cacheHits + 1 &&
    afterCached.spentMicros === afterPaid.spentMicros,
  `hits ${afterCached.cacheHits}, saved ${afterCached.savedMicros}µ$`,
);

await stream(`/tickets/${first.id}/triage`, { noCache: 'true' });
const afterNoCache = await usage();
check(
  'noCache pays again, so the saving can be compared',
  afterNoCache.spentMicros > afterCached.spentMicros,
  `+${afterNoCache.spentMicros - afterCached.spentMicros}µ$`,
);

// The recovery paths, which are the reason the fault switch exists.
const malformed = await stream(`/tickets/${second.id}/triage`, {
  fault: 'malformed_output',
  noCache: 'true',
});
check(
  'a corrupt response is rejected with the parser error and re-asked',
  malformed.attempts[0]?.outcome === 'invalid_output' &&
    typeof malformed.attempts[0]?.error === 'string' &&
    malformed.attempts.at(-1)?.outcome === 'ok',
  malformed.attempts.map((a) => `#${a.attempt} ${a.outcome}`).join(' → '),
);

const limited = await stream(`/tickets/${second.id}/triage`, {
  fault: 'rate_limit',
  noCache: 'true',
});
check(
  'a rate limit backs off and recovers',
  limited.attempts[0]?.outcome === 'rate_limited' &&
    limited.attempts[0]?.delayMs > 0 &&
    limited.attempts.at(-1)?.outcome === 'ok',
  limited.attempts.map((a) => `#${a.attempt} ${a.outcome}${a.delayMs ? ` +${a.delayMs}ms` : ''}`).join(' → '),
);

const afterFaults = await usage();
check(
  'every attempt is recorded, including the failed ones',
  afterFaults.retries > 0 && afterFaults.failures > 0,
  `${afterFaults.retries} retries, ${afterFaults.failures} failed calls`,
);

// Both prompt versions still answer, and each records which one produced it.
const ambiguous = tickets.find((t) => /error/i.test(t.subject)) ?? tickets[2];
const v1 = await stream(`/tickets/${ambiguous.id}/triage`, { promptVersion: 'v1', noCache: 'true' });
const v2 = await stream(`/tickets/${ambiguous.id}/triage`, { promptVersion: 'v2', noCache: 'true' });
check(
  'each classification records the prompt version that produced it',
  v1.done?.promptVersion === 'v1' && v2.done?.promptVersion === 'v2',
  `v1 ${v1.done?.priority}/${v1.done?.confidence} · v2 ${v2.done?.priority}/${v2.done?.confidence}`,
);

// A draft is a suggestion; what gets stored is whatever the agent approved.
const draft = await stream(`/tickets/${first.id}/draft`);
check('a reply drafts and streams', draft.tokens > 0 && draft.done?.body, `${draft.tokens} tokens`);

const edited = `Approved by the smoke test at ${new Date().toISOString()}`;
await call(`/tickets/${first.id}/approve`, { method: 'POST', body: { body: edited } });
const stored = (await call(`/tickets/${first.id}`)).draft;
check(
  'the approved text is the agent’s, not the model’s',
  stored.approved === true && stored.body === edited,
);

// The boundaries. An unauthenticated endpoint that provisions paid model work
// would be an invitation, and an unvalidated enum is how a demo becomes a bill.
check(
  'an invented fault is rejected',
  (await expectStatus('', `/tickets/${first.id}/triage?fault=nonsense`, { method: 'POST' })) === 400,
);

const savedToken = token;
token = undefined;
check('the queue refuses an unauthenticated caller', (await expectStatus('', '/tickets')) === 401);
token = savedToken;

const final = await usage();
console.log(
  `\n${final.calls} model calls · spent ${final.spentMicros}µ$ · saved ${final.savedMicros}µ$ ` +
    `· ${final.cacheHits} cache hits · ${final.retries} retries · ${final.failures} failed calls`,
);
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);

process.exit(failures === 0 ? 0 : 1);
