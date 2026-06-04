import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { createDb, databaseUrl } from "./client.js";
import {
  accounts,
  categories,
  transactions,
  users,
  workspaceMembers,
  workspaces,
} from "./schema.js";

const scryptAsync = promisify(scrypt);

/** Standalone scrypt hashing (kept here to avoid a db -> core dependency cycle). */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

const DEMO_EMAIL = "demo@naxeu.app";
const DEMO_PASSWORD = "demo123456";

export async function seed(url: string = databaseUrl()): Promise<void> {
  const { db, close } = createDb(url);
  try {
    const existing = await db.select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) {
      console.log("[seed] users already present, skipping seed");
      return;
    }

    const [user] = await db
      .insert(users)
      .values({ email: DEMO_EMAIL, name: "Demo User", passwordHash: await hashPassword(DEMO_PASSWORD) })
      .returning();

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Demo Family", type: "family" })
      .returning();

    await db
      .insert(workspaceMembers)
      .values({ workspaceId: workspace!.id, userId: user!.id, role: "owner" });

    const [bank, card, cash] = await db
      .insert(accounts)
      .values([
        { workspaceId: workspace!.id, name: "Bankkonto", type: "bank" },
        { workspaceId: workspace!.id, name: "Kreditkarte", type: "credit_card" },
        { workspaceId: workspace!.id, name: "Bargeld", type: "cash" },
      ])
      .returning();

    // Categories with budgets defined directly on the category (no budgets table).
    const categoryDefs = [
      { name: "Gehalt", type: "income", monthlyBudget: null },
      { name: "Lebensmittel", type: "expense", monthlyBudget: "500" },
      { name: "Haushalt", type: "expense", monthlyBudget: "150" },
      { name: "Haustiere", type: "expense", monthlyBudget: "100" },
      { name: "Auto / Mobilität", type: "expense", monthlyBudget: "300" },
      { name: "Kinder", type: "expense", monthlyBudget: "200" },
      { name: "Freizeit", type: "expense", monthlyBudget: "150" },
      { name: "Abos", type: "expense", monthlyBudget: "50" },
    ] as const;

    const catRows = await db
      .insert(categories)
      .values(
        categoryDefs.map((c, i) => ({
          workspaceId: workspace!.id,
          name: c.name,
          type: c.type,
          monthlyBudget: c.monthlyBudget,
          sortOrder: i,
        })),
      )
      .returning();
    const cat = (name: string) => catRows.find((c) => c.name === name)!.id;

    const today = new Date();
    const d = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-05`;

    // Gehalt (income)
    await db.insert(transactions).values({
      workspaceId: workspace!.id,
      accountId: bank!.id,
      categoryId: cat("Gehalt"),
      createdByUserId: user!.id,
      type: "income",
      status: "confirmed",
      date: d,
      amount: "3250.00",
      merchantName: "Arbeitgeber",
      description: "Gehalt",
      source: "manual",
    });

    // Despar bank payment: affects balance, NOT budget. Children carry the budget.
    const [despar] = await db
      .insert(transactions)
      .values({
        workspaceId: workspace!.id,
        accountId: bank!.id,
        createdByUserId: user!.id,
        type: "expense",
        status: "confirmed",
        date: d,
        amount: "-84.30",
        merchantName: "Despar",
        description: "Despar Einkauf",
        source: "manual",
        affectsAccountBalance: true,
        affectsBudget: false,
      })
      .returning();

    await db.insert(transactions).values([
      child(workspace!.id, user!.id, despar!.id, cat("Lebensmittel"), d, "-3.20", "Brot"),
      child(workspace!.id, user!.id, despar!.id, cat("Haustiere"), d, "-12.50", "Katzenfutter"),
      child(workspace!.id, user!.id, despar!.id, cat("Haushalt"), d, "-8.90", "Waschmittel"),
      child(workspace!.id, user!.id, despar!.id, cat("Lebensmittel"), d, "-59.70", "Lebensmittel Rest"),
    ]);

    // Standalone expenses (affect both balance and budget).
    await db.insert(transactions).values([
      simple(workspace!.id, bank!.id, user!.id, cat("Haustiere"), d, "-42.90", "ZooPlus"),
      simple(workspace!.id, bank!.id, user!.id, cat("Abos"), d, "-13.99", "Netflix"),
    ]);

    // Credit card statement: affects balance, not budget; children carry budget.
    const [statement] = await db
      .insert(transactions)
      .values({
        workspaceId: workspace!.id,
        accountId: card!.id,
        createdByUserId: user!.id,
        type: "expense",
        status: "confirmed",
        date: d,
        amount: "-450.00",
        merchantName: "Kreditkartenabrechnung",
        description: "Monatsabrechnung",
        source: "manual",
        affectsAccountBalance: true,
        affectsBudget: false,
      })
      .returning();

    await db.insert(transactions).values([
      child(workspace!.id, user!.id, statement!.id, cat("Haushalt"), d, "-89.90", "Amazon"),
      child(workspace!.id, user!.id, statement!.id, cat("Abos"), d, "-9.99", "Apple"),
    ]);

    console.log(`[seed] done. Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    void cash;
    void sql;
  } finally {
    await close();
  }
}

function child(
  workspaceId: string,
  userId: string,
  parentId: string,
  categoryId: string,
  date: string,
  amount: string,
  description: string,
) {
  return {
    workspaceId,
    parentId,
    categoryId,
    createdByUserId: userId,
    type: "item" as const,
    status: "confirmed",
    date,
    amount,
    merchantName: description,
    description,
    source: "manual",
    // Receipt/statement line item: affects budget, not the account balance.
    affectsAccountBalance: false,
    affectsBudget: true,
  };
}

function simple(
  workspaceId: string,
  accountId: string,
  userId: string,
  categoryId: string,
  date: string,
  amount: string,
  merchant: string,
) {
  return {
    workspaceId,
    accountId,
    categoryId,
    createdByUserId: userId,
    type: "expense" as const,
    status: "confirmed",
    date,
    amount,
    merchantName: merchant,
    description: merchant,
    source: "manual",
    affectsAccountBalance: true,
    affectsBudget: true,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[seed] failed", err);
      process.exit(1);
    });
}
