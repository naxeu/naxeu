import { Redis } from "ioredis";
import { REALTIME_REDIS_CHANNEL, type RealtimeEvent } from "@naxeu/shared";
import type { RealtimePublisher } from "@naxeu/core";

/**
 * Worker-side realtime publisher. The worker never holds WebSocket connections;
 * it just publishes minimal events to Redis, which API instances forward to
 * their connected sockets. Falls back to a no-op when Redis is unavailable.
 */
export class RedisPublisher implements RealtimePublisher {
  private redis: Redis | null = null;

  constructor(private readonly redisUrl: string | null) {}

  async start(): Promise<void> {
    if (!this.redisUrl) return;
    this.redis = new Redis(this.redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
    await this.redis.connect();
  }

  async stop(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }

  async publish(event: RealtimeEvent): Promise<void> {
    if (!this.redis) return;
    await this.redis.publish(REALTIME_REDIS_CHANNEL, JSON.stringify(event));
  }
}
