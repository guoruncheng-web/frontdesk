-- Frontdesk initial schema.

CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Brute-force protection lives here rather than in process memory: attempts
    -- land on different serverless instances and a cold start would clear an
    -- in-memory counter for free.
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sender_name" VARCHAR(160) NOT NULL,
    "sender_email" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "channel" VARCHAR(24) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "triages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "priority" VARCHAR(16) NOT NULL,
    "summary" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "prompt_version" VARCHAR(16) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "drafts" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "llm_calls" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID,
    "purpose" VARCHAR(24) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "prompt_version" VARCHAR(16) NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "outcome" VARCHAR(24) NOT NULL,
    "input_hash" VARCHAR(64) NOT NULL,
    "cache_hit" BOOLEAN NOT NULL DEFAULT false,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_micros" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "ttfb_ms" INTEGER,
    "response" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_calls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");
CREATE INDEX "organizations_is_demo_created_at_idx" ON "organizations"("is_demo", "created_at");
CREATE INDEX "tickets_organization_id_received_at_idx" ON "tickets"("organization_id", "received_at" DESC);
CREATE INDEX "tickets_organization_id_status_idx" ON "tickets"("organization_id", "status");
CREATE UNIQUE INDEX "triages_ticket_id_key" ON "triages"("ticket_id");
CREATE UNIQUE INDEX "drafts_ticket_id_key" ON "drafts"("ticket_id");
CREATE INDEX "llm_calls_organization_id_created_at_idx" ON "llm_calls"("organization_id", "created_at" DESC);
-- Drives the cache lookup: same tenant, same input, most recent success.
CREATE INDEX "llm_calls_organization_id_input_hash_idx" ON "llm_calls"("organization_id", "input_hash");

ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "triages" ADD CONSTRAINT "triages_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The model invents category synonyms when left to itself: "billing" on one
-- call and "billing_and_payments" on the next. The application validates
-- against the same list; this is the backstop that keeps a bad deploy or a
-- manual UPDATE from filling the column with variants no report can group by.
ALTER TABLE "triages" ADD CONSTRAINT "triages_category_check"
    CHECK ("category" IN ('billing','technical','account','shipping','refund','feedback','other'));
ALTER TABLE "triages" ADD CONSTRAINT "triages_priority_check"
    CHECK ("priority" IN ('low','normal','urgent'));
ALTER TABLE "triages" ADD CONSTRAINT "triages_confidence_check"
    CHECK ("confidence" >= 0 AND "confidence" <= 1);

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_status_check"
    CHECK ("status" IN ('new','triaged','replied','closed'));

-- Cost and token counts are never negative; a bug that makes them so would
-- quietly corrupt every total on the usage panel.
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_non_negative_check"
    CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0 AND "cost_micros" >= 0 AND "latency_ms" >= 0);
