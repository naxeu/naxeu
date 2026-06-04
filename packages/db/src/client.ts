import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;

let queryClient: ReturnType<typeof postgres> | null = null;
let dbInstance: Database | null = null;

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

/** Returns a memoised Drizzle DB instance backed by a postgres-js pool. */
export function getDb(url: string = databaseUrl()): Database {
  if (dbInstance) return dbInstance;
  queryClient = postgres(url, { max: 10 });
  dbInstance = drizzle(queryClient, { schema, logger: process.env.DB_LOG === "1" });
  return dbInstance;
}

/** Creates an isolated DB instance (used by tests that need their own pool). */
export function createDb(url: string): { db: Database; close: () => Promise<void> } {
  const client = postgres(url, { max: 5 });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}

export async function closeDb(): Promise<void> {
  if (queryClient) {
    await queryClient.end();
    queryClient = null;
    dbInstance = null;
  }
}
