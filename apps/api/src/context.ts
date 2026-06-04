import { AiService } from "@naxeu/ai";
import { loadConfig } from "@naxeu/config";
import { getDb } from "@naxeu/db";
import type { ServiceContext } from "@naxeu/core";
import { buildSenders } from "./senders.js";
import type { RealtimeHub } from "./realtime.js";

/** Builds the shared ServiceContext used by all routes. */
export function buildServiceContext(realtime: RealtimeHub, databaseUrl: string): ServiceContext {
  const config = loadConfig();
  return {
    db: getDb(databaseUrl),
    ai: AiService.fromConfig(config.ai),
    config: config.app,
    realtime,
    senders: buildSenders(),
  };
}
