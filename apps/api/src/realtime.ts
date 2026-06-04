import { Redis } from "ioredis";
import type { WebSocket } from "@fastify/websocket";
import { REALTIME_REDIS_CHANNEL, type RealtimeEvent } from "@naxeu/shared";
import type { RealtimePublisher } from "@naxeu/core";

interface Connection {
  socket: WebSocket;
  userId: string;
  workspaceId: string;
}

/**
 * Fans realtime events out to connected WebSocket clients.
 *
 * Events are published to a Redis pub/sub channel by both the API and the
 * worker. Each API instance subscribes and forwards matching events to its
 * locally connected sockets. Only minimal, non-sensitive envelopes are sent.
 */
export class RealtimeHub implements RealtimePublisher {
  private readonly connections = new Set<Connection>();
  private pub: Redis | null = null;
  private sub: Redis | null = null;

  constructor(private readonly redisUrl: string | null) {}

  async start(): Promise<void> {
    if (!this.redisUrl) return;
    this.pub = new Redis(this.redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
    this.sub = new Redis(this.redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
    await this.pub.connect();
    await this.sub.connect();
    await this.sub.subscribe(REALTIME_REDIS_CHANNEL);
    this.sub.on("message", (_channel, raw) => {
      try {
        this.deliverLocal(JSON.parse(raw) as RealtimeEvent);
      } catch {
        /* ignore malformed payloads */
      }
    });
  }

  async stop(): Promise<void> {
    await this.pub?.quit().catch(() => undefined);
    await this.sub?.quit().catch(() => undefined);
  }

  addConnection(conn: Connection): void {
    this.connections.add(conn);
  }

  removeConnection(conn: Connection): void {
    this.connections.delete(conn);
  }

  /** Publishes an event (to Redis if available, otherwise direct local fan-out). */
  async publish(event: RealtimeEvent): Promise<void> {
    if (this.pub) {
      await this.pub.publish(REALTIME_REDIS_CHANNEL, JSON.stringify(event));
    } else {
      this.deliverLocal(event);
    }
  }

  /** Sends an event to local sockets that are authorised to receive it. */
  private deliverLocal(event: RealtimeEvent): void {
    const payload = JSON.stringify(event);
    for (const conn of this.connections) {
      // Workspace isolation: a socket only receives events for its workspace.
      if (conn.workspaceId !== event.workspaceId) continue;
      if (conn.socket.readyState === conn.socket.OPEN) {
        conn.socket.send(payload);
      }
    }
  }
}
