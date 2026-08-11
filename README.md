# Frontdesk

AI triage for a support inbox. Incoming tickets are classified, given a
priority, and answered with a draft an agent approves or rewrites. Nothing is
sent without a person seeing it.

The interesting part is not that a model can classify a ticket. It is what
happens when it returns malformed JSON, when the provider rate-limits you, when
the same question is asked twice, and when someone asks what the month's bill
will be. This demo lets you trigger each of those and watch the answer.

**[Open the live demo →](https://frontdesk-web-psi.vercel.app)**

- Console — https://frontdesk-web-psi.vercel.app
- API docs (Swagger) — https://frontdesk-api.vercel.app/api/docs
- Health check — https://frontdesk-api.vercel.app/api/health

No sign-up needed: press **Open a demo inbox** and you get a private workspace
seeded with twelve tickets. Every classification below runs against a real model
and a real bill.

## What you can do in the demo

Press **Open a demo inbox** and you get twelve tickets in a workspace of your
own. Then:

| Do this | Watch |
| --- | --- |
| **Classify** a ticket | The JSON streams in token by token; the verdict, confidence and cost land underneath |
| Set fault to **Corrupt the model's JSON** | Attempt 1 fails with the exact parser error, the retry delay is shown, attempt 2 is re-asked *with the rejected output and the complaint attached*, and it recovers |
| Set fault to **Rate-limit the first attempt** | The backoff obeys the provider's `retry-after` instead of guessing |
| Classify the same ticket twice | The second run is served from cache at zero cost, and the saving appears on the usage panel |
| Tick **Skip cache** | It pays again, so you can compare |
| Switch **Prompt v1 → v2** | Same ticket, different rubric. v1 states the task; v2 defines what each priority means and tells the model to lower its confidence when unsure |
| Open **it says error** | Confidence drops to ~0.75 and the ticket is flagged for a human instead of being guessed at |
| **Draft a reply**, edit it, **Approve** | The stored text is yours, not the model's |

## Measured, not estimated

Numbers from a full run over the sample inbox, against DeepSeek from a Vercel
US-East function:

| | |
| --- | --- |
| Cost per ticket classified | **$0.000121** (~$0.12 per 1,000) |
| Time to first token | 310–360 ms |
| Full classification | 0.8–1.2 s |
| Recovery from a corrupt response | 2 attempts |

Cost is recorded per call in integer millionths of a dollar and summed — never
derived from an average. A cache hit is stored at zero, which is what makes the
"saved" figure real rather than a claim.

## Architecture

```
Browser ──▶ Next.js (Vercel) ──▶ NestJS (Vercel Functions) ──┬─▶ Postgres (Supabase)
             streaming SSE        triage · retries · cost     └─▶ any OpenAI-compatible model API
```

```
web/      Next.js 15 console — queue, ticket detail, run timeline, usage panel
server/   NestJS 11 API — LLM client, triage pipeline, auth, per-visitor sandboxes
```

## Design decisions worth calling out

**The SSE reader buffers across chunk boundaries.** A single event is not
guaranteed to arrive in one TCP chunk, and a reader that splits each chunk on
newlines silently drops whatever straddles the split. This cost real debugging
time: the model appeared to emit malformed JSON on roughly one call in six, and
the investigation went looking at the model. It was the parser. Both the server
reader and the browser reader are written for this, and both have a test that
feeds them a deliberately split event.

**Categories are a closed enum, checked after the model answers.** Asked the
same question six times, the model returned `billing` five times and
`billing_and_payments` once — same meaning, different string. A free-text column
collects every synonym the model ever invents and no report grouping by category
is trustworthy again. The API validates against the list and a `CHECK`
constraint enforces it in the database.

**A schema failure is retried with the complaint attached.** Re-asking the
original question gets the same answer, because nothing told the model what was
wrong. The retry sends its rejected output back with the specific validation
error. The generic retry policy refuses to retry invalid output for exactly that
reason; the triage path overrides it explicitly rather than disguising the error
as something retryable to slip past the policy.

**Backoff uses full jitter.** A provider that rate-limits usually rate-limits
every in-flight request at once. A fixed 1s/2s/4s schedule sends the whole batch
back in lockstep and trips the limit again. The provider's `retry-after` always
wins over the computed delay.

**Every attempt is recorded, not just the successful one.** Retries, schema
repairs and outright failures each leave a row in `llm_calls`. That table is
what the usage panel and the run timeline read from — a retry nobody can see may
as well not have happened, and a cost panel with no failed calls in it is
lying about the bill.

**Prompts are versioned in code.** Changing a prompt alters every classification
the product makes, which is the blast radius of a schema migration. Keeping them
in the repo means a change is a diff someone reviews, ships with the code that
depends on it, and rolls back with it. Every call records the version that
produced it.

**The model client targets the OpenAI-compatible surface, not a vendor SDK.**
DeepSeek, OpenAI, Together, Groq and most self-hosted gateways speak the same
`POST /chat/completions`, so switching provider is two environment variables.
Clients care about this more than they say: they may already have an OpenAI
contract, or want to move to an open model when the bill arrives, and a codebase
welded to one SDK makes that a rewrite.

**Failed sign-ins are counted in Postgres.** An in-process counter is close to
worthless on serverless — attempts land on different instances and every cold
start clears it. The lockout backs off 1/2/4/8 minutes up to an hour.

**Each demo visitor gets their own workspace.** A shared demo account is one
visitor away from being emptied out, and the next person judges the work by the
wreckage. Sandboxes are reaped after a day, and capped, because an
unauthenticated endpoint that provisions paid model work is an invitation.

## What it deliberately does not do

**Nothing is ever sent.** There is no outbound email, no ticketing-system
integration, no webhook. A draft is stored and approved; delivery is out of
scope, and half an integration would be worse than none.

**The classifier is not evaluated.** There is no labelled set, no accuracy
number, no regression suite over the prompts. Comparing v1 and v2 by eye is not
measurement, and the honest version of that feature is a scored eval set, which
is its own project.

**Classifications are not deterministic.** Running the same inbox twice moved
one ticket from `refund/normal` to `refund/low` and another from `billing` to
`account`. That is the nature of the thing, not a bug, and it is why the closed
enum, the confidence score and the human approval step all exist. A demo that
implied otherwise would be selling something that does not exist.

**One user per organization.** No invitations, no roles, no permissions.

## Running it locally

```bash
cd server
cp .env.example .env      # DATABASE_URL, DIRECT_URL, JWT_SECRET, LLM_API_KEY
pnpm install
pnpm prisma migrate deploy
pnpm dev                  # http://localhost:8080/api  (docs at /api/docs)

cd ../web
cp .env.example .env.local
pnpm install
pnpm dev                  # http://localhost:3000
```

Any OpenAI-compatible endpoint works. Point `LLM_BASE_URL`, `LLM_MODEL` and the
two price variables at whichever provider you have a key for.

## Tests

```bash
cd server && pnpm test        # 31 unit tests
cd web    && pnpm test        # 10 unit tests
```

The suites concentrate on the parts that fail quietly: an SSE event split across
chunk boundaries, a multi-byte character split mid-sequence, backoff staying
inside its ceiling while still spreading, `retry-after` overriding the computed
delay, invented categories being rejected, and a fenced or preambled JSON
response still being read.

## API

`GET /api/docs` serves Swagger UI.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/demo/session` | Mint a sandbox inbox and sign into it |
| `POST` | `/api/auth/register` · `/api/auth/login` | Credentials |
| `GET` | `/api/tickets` | The queue |
| `GET` | `/api/tickets/:id` | One ticket with its triage, draft and every model call |
| `POST` | `/api/tickets/:id/triage` | Classify — **server-sent events**, not JSON |
| `POST` | `/api/tickets/:id/draft` | Draft a reply — **server-sent events** |
| `POST` | `/api/tickets/:id/approve` | Approve the reply as edited |
| `GET` | `/api/usage` | Spend, savings, retries, failures |
| `GET` | `/api/prompts` | The prompt versions available to compare |
| `GET` | `/api/health` | Liveness probe that round-trips the database |

Everything outside `/demo`, `/auth` and `/health` requires
`Authorization: Bearer <token>`.
