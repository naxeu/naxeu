import type { AiService } from "@naxeu/ai";
import type { AppConfig } from "@naxeu/config";
import type { Database } from "@naxeu/db";
import type { RealtimeEvent } from "@naxeu/shared";

/** Publishes a minimal realtime event (no sensitive payloads) to subscribers. */
export interface RealtimePublisher {
  publish(event: RealtimeEvent): Promise<void> | void;
}

/** Sends an external message on a single channel. Returns provider info. */
export interface ChannelSender {
  channel: "push" | "email" | "sms";
  send(args: {
    userId: string;
    title: string;
    body: string | null;
  }): Promise<{ ok: boolean; provider?: string; providerMessageId?: string; error?: string }>;
}

/** Shared dependencies passed to every service. */
export interface ServiceContext {
  db: Database;
  ai: AiService;
  config: AppConfig;
  realtime: RealtimePublisher;
  senders?: ChannelSender[];
}

/** No-op publisher (used in tests / when realtime is unavailable). */
export const noopRealtime: RealtimePublisher = {
  publish() {
    /* intentionally empty */
  },
};
