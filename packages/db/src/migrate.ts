import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { databaseUrl } from "./client.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Applies all generated SQL migrations from ../migrations. */
export async function runMigrations(url: string = databaseUrl()): Promise<void> {
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: join(here, "..", "migrations") });
  await client.end();
}

// Allow `tsx src/migrate.ts` to run migrations directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log("[db] migrations applied");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[db] migration failed", err);
      process.exit(1);
    });
}
