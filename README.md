# Naxeu — Dein Geld im Überblick.

**Naxeu — AI-assisted finance overview for families.**

Naxeu is a self-hostable PWA that lets families and individuals capture, structure,
analyse and budget their income and expenses. This repository contains the
**Naxeu Community Edition** — a single-instance / single-household, AGPLv3-licensed,
Docker-first MVP.

Domains (referenced for branding only in this MVP):

- `naxeu.com` — website, docs, pricing, blog
- `naxeu.app` — the PWA / app login
- `naxeu.cloud` — hosted cloud offering

> Community Edition only. No billing, no bank APIs, no multi-tenant SaaS, no
> enterprise features. Naxeu Cloud and Naxeu Enterprise will later share a
> separate commercial codebase; none of it lives here.

---

## Features

- Fast manual transaction entry with a natural-language **quick input**
  (`despar 84,30 karte`, `+3250 gehalt`, …) parsed by the AI layer / heuristics.
- **Hierarchical transactions** via `parent_id` (credit-card statements with
  sub-transactions, bank payments broken down into receipt line items).
- **Budgets defined directly on categories** (there is no `budgets` table).
- Parent/child transactions are **never double-counted**, governed by the
  `affects_budget` and `affects_account_balance` flags.
- **Attachments** (receipts/invoices) instead of a `receipts` table, with mock
  AI extraction that creates child transactions.
- **Automations**: rule engine with conditions/actions, run logging, loop guard.
- **Persistent event system** + background **worker**.
- **Generic messages/notifications** with per-type delivery preferences
  (`first_success`, quiet hours, digest modes) and delivery attempt logging.
- **Realtime updates** over WebSockets (minimal, non-sensitive event envelopes).
- **AI features** through the Vercel AI SDK, configured via YAML, with a Mock
  provider so everything runs with **no real API key**.
- CSV import with dedupe, monthly budget overview, in-app message inbox.

---

## Tech stack

Vue 3 · Vuetify · Vite · Pinia · Vue Router · PWA · Node.js · TypeScript ·
Fastify · PostgreSQL · Drizzle ORM · Zod · Vercel AI SDK · WebSockets · Vitest ·
Playwright · Docker Compose · pnpm workspaces.

## Monorepo layout

```
apps/
  web/      Vue 3 + Vite + Vuetify + Pinia + Vue Router + PWA
  api/      Fastify + TypeScript REST API + WebSocket
  worker/   Background worker: events, automations, budgets, messages
packages/
  shared/   Shared types, Zod schemas, enums, realtime contracts
  db/       Drizzle schema, migrations, client, seed
  config/   YAML config loader (app/ai/branding)
  ai/       AI service (Vercel AI SDK) + Mock provider + heuristics
  core/     Business logic: transactions, budgets, automations, messages
config/     app.yml, ai.yml, branding.yml
```

---

## Quick start (Docker)

```bash
cp .env.example .env        # optional: adjust secrets
docker compose up --build
```

Services started: `postgres`, `redis`, `api`, `worker`, `web`.
On first boot the API runs migrations and seeds demo data automatically.

Local URLs:

- PWA: <http://localhost:5173>
- API: <http://localhost:3000>
- API health check: <http://localhost:3000/health>

### Demo login

```
demo@naxeu.app
demo123456
```

The seed creates the **Demo Family** workspace, three accounts (Bankkonto,
Kreditkarte, Bargeld), budget categories, and example transactions including a
credit-card statement and a Despar receipt with sub-transactions.

---

## Local development (without Docker)

Requires Node 20+, pnpm, a PostgreSQL instance and (optionally) Redis.

```bash
pnpm install

# point at your database
export DATABASE_URL="postgres://naxeu:naxeu@localhost:5432/naxeu"
export REDIS_URL="redis://localhost:6379"
export CONFIG_DIR="$PWD/config"

pnpm db:migrate      # apply Drizzle migrations
pnpm db:seed         # seed demo data

pnpm dev:api         # http://localhost:3000
pnpm dev:worker      # background worker
pnpm dev:web         # http://localhost:5173 (VITE_API_URL=http://localhost:3000)
```

To regenerate migrations after editing the Drizzle schema: `pnpm db:generate`.

---

## Running tests

```bash
# Unit tests (pure business logic, schemas, heuristics, config loader)
pnpm -r test

# API integration tests (Fastify inject against a real Postgres test DB)
TEST_DATABASE_URL="postgres://naxeu:naxeu@localhost:5432/naxeu_test" \
  pnpm --filter @naxeu/api test

# End-to-end (Playwright; requires api + worker + web running)
pnpm --filter @naxeu/web exec playwright install chromium
E2E_BASE_URL=http://localhost:5173 pnpm --filter @naxeu/web test:e2e

# Type-check everything
pnpm -r typecheck
```

Coverage highlights: transaction-tree double-counting, `affects_budget` /
`affects_account_balance`, refunds, monthly budget calculation + thresholds,
automation matching/priority/loop-guard, message delivery (`first_success`
fallback, quiet hours, digest), AI heuristics, API auth/CRUD/validation, and an
E2E budget-warning happy path.

---

## Configuration

All configuration is YAML in `config/` (no branding or secrets in the database).

### Branding — `config/branding.yml`

App name, taglines, theme colours, domains, email from-address and legal links.
The PWA fetches it from `GET /branding` and themes itself accordingly. **Change
the product name and colours here**, not in code or the DB.

### AI — `config/ai.yml`

```yaml
ai:
  enabled: false          # MVP runs fully on the mock provider
  defaultProvider: mock
  providers: { mock, openai, anthropic, local }
  tasks:
    quickInputParsing:        { provider: mock, model: "mock" }
    transactionCategorization:{ provider: mock, model: "mock" }
    attachmentExtraction:     { provider: mock, model: "mock" }
    monthlySummary:           { provider: mock, model: "mock" }
```

To use a real model: set `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`) in `.env`,
flip `enabled: true`, and repoint a task to the `openai`/`anthropic`/`local`
provider. `${VAR}` placeholders are resolved from the environment. The Vercel AI
SDK is used **only** inside `packages/ai`; business logic never imports it, and
all AI output is validated with Zod (falling back to heuristics on failure).

### App — `config/app.yml`

Edition, default workspace name/type, auth token TTL & registration toggle,
default budget alert threshold, message defaults, and worker tuning
(`pollIntervalMs`, `maxAutomationDepth`).

---

## Data model (PostgreSQL + Drizzle)

`users`, `workspaces`, `workspace_members`, `accounts`, `categories`,
`transactions`, `attachments`, `imports`, `events`, `automation_rules`,
`automation_runs`, `messages`, `message_preferences`, `message_attempts`,
`push_subscriptions`.

Notable design choices:

- **No `budgets` table** — `monthly_budget` / `budget_alert_threshold` live on
  `categories`.
- **No `receipts` table** — receipts are `attachments`.
- Every domain row carries `workspace_id` so the same code can later power Cloud
  and Enterprise editions, even though the Community Edition runs one household.

### Credit cards & transfers

- Credit cards are regular `accounts` with `type = credit_card`.
- A credit-card **purchase** is a normal expense booked on the card account and
  **counts toward the budget in the purchase month** (`affects_budget = true`).
- Paying the statement from the bank is a **transfer** (`type = transfer`) using
  `account_id` (source) + `counter_account_id` (destination). Transfers move
  money between accounts (`affects_account_balance = true`) but **never count
  toward the budget again** (`affects_budget` is forced to `false`). In account
  balances the signed amount is applied to the source and its opposite to the
  destination, so paying off a card brings its balance back toward zero without
  double-counting the spend.
- If individual card transactions were not imported, a **credit-card statement**
  can instead be modelled as a parent transaction (`affects_budget = false`) and
  split into child transactions that carry the budget — see the seed data.

`GET /accounts` returns each account's derived `balance`, shown in the Dashboard
"Konten" card.

---

## How the event pipeline works

```
API writes domain data
  → API inserts an event row (events table, status = pending)
  → Worker claims events (FOR UPDATE SKIP LOCKED — events are never lost)
  → Worker runs matching automation rules (depth-guarded, logged in automation_runs)
  → Worker checks budget thresholds and creates messages
  → Worker / API publish minimal realtime events to Redis → WebSocket clients
```

Realtime payloads contain only `{ type, entityType, entityId, workspaceId,
timestamp, meta? }` — never full/sensitive objects. The PWA refetches details
from the REST API.

---

## API overview

Auth (`/auth/register|login|me`), transactions (CRUD + `/children` + `/tree`),
categories, accounts, `/budgets/monthly?month=YYYY-MM`, messages &
`/message-preferences`, automation rules & runs, attachments (`/analyze`),
imports (`/imports/csv`), `/settings`, `/branding`, and AI
(`/ai/parse-quick-input`, `/ai/categorize-transaction`, `/ai/extract-attachment`).
Realtime WebSocket at `ws://host/ws?token=<jwt>`.

---

## Open TODOs / non-goals for this MVP

- Real Web Push & SMTP delivery are mocked (interfaces and `message_attempts`
  logging are in place; push "fails" without VAPID keys to demonstrate the
  email fallback).
- Digest delivery (`digest_daily` / `digest_weekly`) is detected and deferred,
  but a digest scheduler is not yet implemented.
- No bank APIs, billing, multi-tenant SaaS, or enterprise/white-label features
  (these belong to the future Cloud/Enterprise commercial codebase).

---

## License

AGPLv3 — see [`LICENSE`](./LICENSE).
