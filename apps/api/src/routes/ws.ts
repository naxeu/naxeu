import type { FastifyInstance } from "fastify";
import type { AuthTokenPayload } from "@naxeu/shared";

/**
 * Realtime WebSocket endpoint: `ws://host/ws?token=<jwt>`.
 *
 * The token is verified before the socket joins the hub. Each connection is
 * scoped to the authenticated user's workspace, enforcing workspace isolation
 * so users never receive events from foreign workspaces.
 */
export async function registerWebsocketRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ws", { websocket: true }, (socket, request) => {
    const token = (request.query as { token?: string }).token;
    let payload: AuthTokenPayload;
    try {
      if (!token) throw new Error("missing token");
      payload = app.jwt.verify<AuthTokenPayload>(token);
    } catch {
      socket.send(JSON.stringify({ error: "unauthorized" }));
      socket.close();
      return;
    }

    const conn = { socket, userId: payload.userId, workspaceId: payload.workspaceId };
    app.realtime.addConnection(conn);
    socket.send(
      JSON.stringify({ type: "connected", workspaceId: payload.workspaceId, timestamp: new Date().toISOString() }),
    );

    socket.on("close", () => app.realtime.removeConnection(conn));
    socket.on("error", () => app.realtime.removeConnection(conn));
  });
}
