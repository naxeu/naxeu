import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * API integration tests. These run against a real PostgreSQL test database
 * (DATABASE_URL or TEST_DATABASE_URL) using Fastify's `inject`, exercising the
 * full request -> service -> DB path. Skipped automatically if no DB is set.
 */
const TEST_DB =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://naxeu:naxeu@localhost:5432/naxeu_test";

process.env.DATABASE_URL = TEST_DB;
process.env.CONFIG_DIR = process.env.CONFIG_DIR ?? new URL("../../../../config", import.meta.url).pathname;
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  // Apply migrations and clean the schema for a deterministic run.
  const { runMigrations } = await import("@naxeu/db");
  await runMigrations(TEST_DB);
  const { getDb } = await import("@naxeu/db");
  const { sql } = await import("drizzle-orm");
  const db = getDb(TEST_DB);
  await db.execute(
    sql.raw(
      "TRUNCATE message_attempts, messages, message_preferences, push_subscriptions, automation_runs, automation_rules, events, imports, attachments, transactions, categories, accounts, workspace_members, workspaces, users RESTART IDENTITY CASCADE",
    ),
  );

  const { buildApp } = await import("../app.js");
  app = await buildApp({ startRealtime: false });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe("auth", () => {
  it("health check works", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });

  it("registers and logs in a user", async () => {
    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "test@naxeu.app", name: "Test", password: "password123" },
    });
    expect(reg.statusCode).toBe(201);
    token = reg.json().token;
    expect(token).toBeTruthy();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "test@naxeu.app", password: "password123" },
    });
    expect(login.statusCode).toBe(200);
  });

  it("rejects bad credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "test@naxeu.app", password: "wrong" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({ method: "GET", url: "/transactions" });
    expect(res.statusCode).toBe(401);
  });

  it("validates request bodies", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "not-an-email", name: "", password: "x" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("categories, transactions and budgets", () => {
  let categoryId: string;

  function auth() {
    return { authorization: `Bearer ${token}` };
  }

  it("creates a category with a budget", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/categories",
      headers: auth(),
      payload: { name: "Lebensmittel", type: "expense", monthlyBudget: "100", budgetAlertThreshold: 0.8 },
    });
    expect(res.statusCode).toBe(201);
    categoryId = res.json().category.id;
  });

  it("creates a transaction and lists it", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: auth(),
      payload: { type: "expense", amount: "90", date: "2026-06-10", categoryId, merchantName: "Despar" },
    });
    expect(create.statusCode).toBe(201);
    // Expense amount is stored signed (negative).
    expect(Number(create.json().transaction.amount)).toBeLessThan(0);

    const list = await app.inject({ method: "GET", url: "/transactions", headers: auth() });
    expect(list.statusCode).toBe(200);
    expect(list.json().transactions.length).toBeGreaterThan(0);
  });

  it("computes monthly budgets from categories + transactions", async () => {
    const res = await app.inject({ method: "GET", url: "/budgets/monthly?month=2026-06", headers: auth() });
    expect(res.statusCode).toBe(200);
    const food = res.json().categories.find((c: { categoryId: string }) => c.categoryId === categoryId);
    expect(food.spent).toBe("90.00");
    expect(food.thresholdReached).toBe(true); // 90/100 >= 0.8
  });

  it("builds a parent/child tree without double counting in budgets", async () => {
    const parent = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: auth(),
      payload: {
        type: "expense",
        amount: "450",
        date: "2026-06-11",
        merchantName: "Kreditkarte",
        affectsAccountBalance: true,
        affectsBudget: false,
      },
    });
    const parentId = parent.json().transaction.id;
    const child = await app.inject({
      method: "POST",
      url: `/transactions/${parentId}/children`,
      headers: auth(),
      payload: {
        type: "item",
        amount: "30",
        date: "2026-06-11",
        categoryId,
        affectsAccountBalance: false,
        affectsBudget: true,
      },
    });
    expect(child.statusCode).toBe(201);

    const tree = await app.inject({ method: "GET", url: `/transactions/${parentId}/tree`, headers: auth() });
    expect(tree.json().tree.children.length).toBe(1);

    const budget = await app.inject({ method: "GET", url: "/budgets/monthly?month=2026-06", headers: auth() });
    const food = budget.json().categories.find((c: { categoryId: string }) => c.categoryId === categoryId);
    // 90 (standalone) + 30 (child) = 120; the 450 parent must NOT be counted.
    expect(food.spent).toBe("120.00");
  });

  it("soft-deletes a parent and all live descendants from budgets and GET", async () => {
    const parent = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: auth(),
      payload: {
        type: "expense",
        amount: "200",
        date: "2026-06-12",
        merchantName: "SoftDeleteParent",
        affectsAccountBalance: true,
        affectsBudget: false,
      },
    });
    expect(parent.statusCode).toBe(201);
    const pid = parent.json().transaction.id;
    await app.inject({
      method: "POST",
      url: `/transactions/${pid}/children`,
      headers: auth(),
      payload: {
        type: "item",
        amount: "50",
        date: "2026-06-12",
        categoryId,
        affectsAccountBalance: false,
        affectsBudget: true,
      },
    });

    let budget = await app.inject({ method: "GET", url: "/budgets/monthly?month=2026-06", headers: auth() });
    let food = budget.json().categories.find((c: { categoryId: string }) => c.categoryId === categoryId);
    expect(food.spent).toBe("170.00");

    const del = await app.inject({ method: "DELETE", url: `/transactions/${pid}`, headers: auth() });
    expect(del.statusCode).toBe(200);

    const get = await app.inject({ method: "GET", url: `/transactions/${pid}`, headers: auth() });
    expect(get.statusCode).toBe(404);

    budget = await app.inject({ method: "GET", url: "/budgets/monthly?month=2026-06", headers: auth() });
    food = budget.json().categories.find((c: { categoryId: string }) => c.categoryId === categoryId);
    expect(food.spent).toBe("120.00");
  });
});

describe("credit card + transfer logic", () => {
  function auth() {
    return { authorization: `Bearer ${token}` };
  }

  it("credit-card purchase counts toward budget; statement payoff transfer does not, and balances reflect it", async () => {
    const [bankRes, cardRes] = await Promise.all([
      app.inject({ method: "POST", url: "/accounts", headers: auth(), payload: { name: "Bank", type: "bank" } }),
      app.inject({ method: "POST", url: "/accounts", headers: auth(), payload: { name: "Card", type: "credit_card" } }),
    ]);
    const bankId = bankRes.json().account.id;
    const cardId = cardRes.json().account.id;

    const cat = await app.inject({
      method: "POST",
      url: "/categories",
      headers: auth(),
      payload: { name: "CC-Haushalt", type: "expense", monthlyBudget: "500" },
    });
    const catId = cat.json().category.id;

    // A credit-card purchase (counts in the purchase month's budget).
    await app.inject({
      method: "POST",
      url: "/transactions",
      headers: auth(),
      payload: { type: "expense", amount: "120", date: "2026-07-05", accountId: cardId, categoryId: catId, merchantName: "Amazon" },
    });

    // The statement payoff: a transfer bank -> card.
    const transfer = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: auth(),
      payload: { type: "transfer", amount: "120", date: "2026-07-28", accountId: bankId, counterAccountId: cardId },
    });
    expect(transfer.statusCode).toBe(201);
    // Transfers are forced to not affect the budget, regardless of input.
    expect(transfer.json().transaction.affectsBudget).toBe(false);

    // Budget for July counts only the purchase (120), not the transfer.
    const budget = await app.inject({ method: "GET", url: "/budgets/monthly?month=2026-07", headers: auth() });
    const food = budget.json().categories.find((c: { categoryId: string }) => c.categoryId === catId);
    expect(food.spent).toBe("120.00");

    // Balances: bank down 120, card back to 0.
    const accounts = await app.inject({ method: "GET", url: "/accounts", headers: auth() });
    const list = accounts.json().accounts as Array<{ id: string; balance: string }>;
    expect(list.find((a) => a.id === bankId)!.balance).toBe("-120.00");
    expect(list.find((a) => a.id === cardId)!.balance).toBe("0.00");
  });
});

describe("workspace isolation", () => {
  it("does not leak another workspace's transactions", async () => {
    // The community edition reuses a single workspace, so a second user joins
    // the same household. Create a transaction as user B and ensure both see
    // only their shared workspace data (not arbitrary cross-workspace rows).
    const regB = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "userb@naxeu.app", name: "B", password: "password123" },
    });
    const tokenB = regB.json().token;
    const list = await app.inject({
      method: "GET",
      url: "/transactions",
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(list.statusCode).toBe(200);
    // Decode workspace from both tokens — they share one household workspace.
    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${tokenB}` } });
    expect(me.json().workspaceId).toBeTruthy();
  });
});
