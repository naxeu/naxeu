import { runMigrations } from "@naxeu/db";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";

async function main(): Promise<void> {
  const env = loadEnv();

  // Apply any pending DB migrations on startup so the schema is always in sync
  // with the running code. This is idempotent (already-applied migrations are
  // skipped) and safe for the single-instance community edition; it prevents
  // "column does not exist" errors when the code is ahead of the database
  // (e.g. a persisted Postgres volume created before a new migration). Disable
  // with AUTO_MIGRATE=false if you manage migrations out-of-band.
  if (process.env.AUTO_MIGRATE !== "false") {
    try {
      await runMigrations(env.databaseUrl);
      console.log("[api] database migrations are up to date");
    } catch (err) {
      console.error("[api] failed to apply migrations on startup", err);
      throw err;
    }
  }

  const app = await buildApp({ env });
  await app.listen({ host: env.host, port: env.port });
  app.log.info(`Naxeu API listening on http://${env.host}:${env.port}`);
}

main().catch((err) => {
  console.error("Failed to start Naxeu API", err);
  process.exit(1);
});
