import { AiService } from "@naxeu/ai";
import { loadConfig } from "@naxeu/config";
import { getDb } from "@naxeu/db";
import {
  buildDefaultSenders,
  claimPendingEvents,
  markEventFailed,
  markEventProcessed,
  type ServiceContext,
} from "@naxeu/core";
import { RedisPublisher } from "./realtime.js";
import { processEvent } from "./processor.js";

let running = true;

async function main(): Promise<void> {
  const config = loadConfig();
  const databaseUrl = process.env.DATABASE_URL ?? "postgres://naxeu:naxeu@localhost:5432/naxeu";
  const redisUrl = process.env.REDIS_URL ?? null;

  const realtime = new RedisPublisher(redisUrl);
  await realtime.start();

  const ctx: ServiceContext = {
    db: getDb(databaseUrl),
    ai: AiService.fromConfig(config.ai),
    config: config.app,
    realtime,
    senders: buildDefaultSenders(),
  };

  const pollInterval = config.app.worker.pollIntervalMs;
  const maxDepth = config.app.worker.maxAutomationDepth;
  console.log(`[worker] started (poll=${pollInterval}ms, maxAutomationDepth=${maxDepth})`);

  const shutdown = async () => {
    running = false;
    await realtime.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (running) {
    try {
      const events = await claimPendingEvents(ctx.db, 20);
      if (events.length === 0) {
        await sleep(pollInterval);
        continue;
      }
      for (const event of events) {
        try {
          await processEvent(ctx, event, maxDepth);
          await markEventProcessed(ctx.db, event.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[worker] event ${event.id} (${event.type}) failed:`, err instanceof Error ? err.stack : message);
          await markEventFailed(ctx.db, event.id, message);
        }
      }
    } catch (err) {
      console.error("[worker] poll loop error:", err);
      await sleep(pollInterval);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
