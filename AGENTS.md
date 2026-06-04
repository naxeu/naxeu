# AGENTS.md — Naxeu Community Edition

Guidance for AI coding agents working in this repository. Read this before
making changes. Human-facing setup/usage docs live in `README.md`.

## What this is

Naxeu is a self-hostable, AGPLv3, **single-household** AI-assisted family finance
PWA. This repo is the **Community Edition** only. Do NOT add billing, bank APIs,
multi-tenant SaaS, white-label, or enterprise features here — those belong to a
future separate commercial codebase (Naxeu Cloud / Enterprise).

## Monorepo layout (pnpm workspaces)

```
apps/web      Vue 3 + Vite + Vuetify + Pinia + Vue Router + PWA
apps/api      Fastify + TypeScript REST API + WebSocket
apps/worker   Background worker: events, automations, budgets, messages
packages/shared  Types, Zod schemas, enums, realtime contracts
packages/db      Drizzle schema, migrations, client, seed
packages/config  YAML config loader (app/ai/branding)
packages/ai      AI service (Vercel AI SDK) + Mock provider + heuristics
packages/core    Business logic: transactions, budgets, automations, messages
config/          app.yml, ai.yml, branding.yml
```

Dependency direction: `shared` ← `config`/`db`/`ai` ← `core` ← `apps`. Never
introduce a cycle (e.g. `db` must not import `core`; the seed inlines its own
password hashing to avoid one).

## Hard architecture rules (do not break)

- **No `budgets` table** — budgets live on `categories` (`monthly_budget`,
  `budget_alert_threshold`). **No `receipts` table** — receipts are `attachments`.
- **No branding in the DB** — branding comes from `config/branding.yml` (served
  via `GET /branding`).
- **Vercel AI SDK is imported ONLY in `packages/ai`** (specifically
  `packages/ai/src/provider.ts`). Business logic must go through `AiService`.
  All AI output must be validated with Zod and degrade to heuristics on failure.
- **Parent/child transactions must never be double-counted.** Budget vs. account
  inclusion is governed by `affects_budget` / `affects_account_balance`. See
  `packages/core/src/transaction-logic.ts` and its tests.
- **Realtime payloads carry no sensitive data** — only `{ type, entityType,
  entityId, workspaceId, timestamp, meta? }`. The PWA refetches details via REST.
- Every domain row carries `workspace_id` even though the community edition runs
  one household. Keep it that way (forward-compat with Cloud/Enterprise).
- Validate all API input and AI output with Zod. TypeScript strict mode stays on.

## Event pipeline

API writes domain data → inserts an `events` row (pending) → worker claims it
(`FOR UPDATE SKIP LOCKED`, never lost) → runs matching automation rules
(depth-guarded via `payload.automationDepth` ≤ `worker.maxAutomationDepth`,
logged in `automation_runs`) → checks budget thresholds and creates messages →
publishes minimal realtime events to Redis → API fans out to WebSocket clients.

When an automation mutates a transaction, write the change directly (no new
domain event) to avoid loops.

## Dev environment

- Node 20+ and pnpm (`packageManager` pinned in root `package.json`).
- `pnpm install` at the repo root installs all workspaces.
- Requires PostgreSQL and (optionally) Redis. Without Redis, realtime falls back
  to direct local fan-out and the worker simply doesn't publish.

Required env when running outside Docker:

```bash
export DATABASE_URL="postgres://naxeu:naxeu@localhost:5432/naxeu"
export REDIS_URL="redis://localhost:6379"     # optional
export CONFIG_DIR="$PWD/config"
export JWT_SECRET="dev-secret-at-least-32-characters-long"
```

Run:

```bash
pnpm db:migrate && pnpm db:seed
pnpm dev:api      # http://localhost:3000  (tsx watch)
pnpm dev:worker   # background worker
pnpm dev:web      # http://localhost:5173  (needs VITE_API_URL=http://localhost:3000)
```

`apps/api` and `apps/worker` run via `tsx` (no build step). The web app builds
with Vite. After editing the Drizzle schema run `pnpm db:generate` and commit the
new files under `packages/db/migrations/`.

## Testing

- Unit tests: `pnpm -r test` (Vitest). Pure logic lives in `packages/core` and
  `packages/ai` and is heavily tested — prefer adding cases there.
- API integration tests use Fastify `inject` against a **real Postgres test DB**:
  ```bash
  TEST_DATABASE_URL="postgres://naxeu:naxeu@localhost:5432/naxeu_test" \
    pnpm --filter @naxeu/api test
  ```
  They auto-migrate and `TRUNCATE ... RESTART IDENTITY CASCADE` for determinism.
- E2E: `pnpm --filter @naxeu/web exec playwright install chromium` then
  `E2E_BASE_URL=http://localhost:5173 pnpm --filter @naxeu/web test:e2e`
  (requires api + worker + web running).
- Type-check everything: `pnpm -r typecheck`.

Packages without test files use `vitest run --passWithNoTests`. The web Vitest
config excludes the Playwright `e2e/` dir.

Vuetify `v-select` in Playwright: click the `.v-field` containing the label, then
click the `role="option"`. Avoid inline TS type annotations inside Vue template
expressions (e.g. `(x as {a: b})` or `(e: T) => ...`) — `vue-tsc` fails to parse
them; move such logic into the `<script>` block.

## Code conventions

- ESM everywhere; `.js` extensions in relative imports (NodeNext-style).
- Money is stored as decimal strings; do arithmetic in integer cents
  (`packages/core/src/money.ts`). Expenses are stored signed-negative, income
  positive (`normalizeSignedAmount`).
- Comments explain non-obvious intent only; no narration.
- No hardcoded secrets. New env vars go in `.env.example`. AI overrides:
  `AI_ENABLED`, `AI_DEFAULT_PROVIDER`, `AI_TASK_<TASK>_PROVIDER` / `_MODEL`
  (see `.env.example`; applied in `packages/config` after `ai.yml` is loaded).

## Cursor Cloud specific instructions

The base Cloud Agent image does NOT ship Postgres, Redis, or Docker. To test:

- Install services: `sudo apt-get update && sudo apt-get install -y postgresql redis-server`,
  then `sudo service postgresql start && sudo service redis-server start`.
- Create the DBs/user once:
  ```bash
  sudo -u postgres psql -c "CREATE USER naxeu WITH PASSWORD 'naxeu' CREATEDB;"
  sudo -u postgres psql -c "CREATE DATABASE naxeu OWNER naxeu;"
  sudo -u postgres psql -c "CREATE DATABASE naxeu_test OWNER naxeu;"
  ```
- Then `DATABASE_URL=postgres://naxeu:naxeu@localhost:5432/naxeu pnpm db:migrate && pnpm db:seed`.

### Docker in the Cloud sandbox

`docker compose up --build` works, but the sandbox kernel needs two workarounds
(the committed `docker-compose.yml`/Dockerfiles are unmodified — only the daemon
flags change):

1. The default `overlay2` storage driver fails (nested overlayfs not permitted)
   and the `nf_tables` iptables backend cannot create the NAT table. Start the
   daemon with the legacy iptables backend and the `vfs` storage driver:
   ```bash
   sudo apt-get install -y docker.io docker-compose-v2
   sudo update-alternatives --set iptables /usr/sbin/iptables-legacy
   sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy
   sudo dockerd --storage-driver=vfs >/tmp/dockerd.log 2>&1 &
   ```
2. Free host ports 3000/5173/5432/6379 first (stop native Postgres/Redis and any
   `pnpm dev:*` servers) — compose publishes those ports.
3. Then `sudo docker compose up -d`; the api container runs migrate+seed on boot.

Builds are slow under `vfs` (~2 min/image). Prefer running services natively for
fast iteration; reserve the Docker path for verifying the container setup.

### Testing preferences

- Prefer end-to-end evidence: API integration tests (`inject` + real Postgres),
  the Playwright budget-warning flow, and manual UI checks of the PWA.
- For worker/event changes, verify the full chain (event → automation → budget
  message → delivery), not just unit logic. The `DB_LOG=1` env var enables
  Drizzle query logging, which is useful when debugging worker DB errors.
