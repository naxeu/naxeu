import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { ServiceContext } from "@naxeu/core";
import type { AuthTokenPayload } from "@naxeu/shared";
import { loadEnv, type ApiEnv } from "./env.js";
import { RealtimeHub } from "./realtime.js";
import { buildServiceContext } from "./context.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerTransactionRoutes } from "./routes/transactions.js";
import { registerCategoryRoutes } from "./routes/categories.js";
import { registerAccountRoutes } from "./routes/accounts.js";
import { registerBudgetRoutes } from "./routes/budgets.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerAutomationRoutes } from "./routes/automations.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
import { registerImportRoutes } from "./routes/imports.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerWebsocketRoutes } from "./routes/ws.js";

declare module "fastify" {
  interface FastifyInstance {
    env: ApiEnv;
    ctx: ServiceContext;
    realtime: RealtimeHub;
    authenticate: (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    auth: AuthTokenPayload;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }
}

export interface BuildAppOptions {
  env?: ApiEnv;
  /** Skip starting the realtime Redis connection (used in tests). */
  startRealtime?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = opts.env ?? loadEnv();
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  await app.register(cors, { origin: env.corsOrigins, credentials: true });
  await app.register(jwt, { secret: env.jwtSecret });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(websocket);

  const realtime = new RealtimeHub(env.redisUrl);
  if (opts.startRealtime !== false) {
    await realtime.start();
  }

  app.decorate("env", env);
  app.decorate("realtime", realtime);
  app.decorate("ctx", buildServiceContext(realtime, env.databaseUrl));

  // Authentication preHandler: verifies the JWT and exposes request.auth.
  app.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
      request.auth = request.user;
    } catch {
      await reply.code(401).send({ error: "unauthorized", message: "Invalid or missing token" });
    }
  });

  const brandingDir = process.env.BRANDING_DIR ?? join(process.cwd(), "branding");
  if (existsSync(brandingDir)) {
    await app.register(fastifyStatic, {
      root: brandingDir,
      prefix: "/brand-assets/",
      decorateReply: false,
    });
  } else {
    app.log.warn({ brandingDir }, "Branding directory missing; /brand-assets/* will 404");
  }

  // Uniform error handling, including Zod validation errors.
  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "validation_error", message: "Invalid request", details: error.flatten() });
    }
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) app.log.error(error);
    return reply.code(statusCode).send({ error: error.name ?? "error", message: error.message });
  });

  app.get("/health", async () => ({ status: "ok", service: "naxeu-api", time: new Date().toISOString() }));

  await app.register(registerAuthRoutes);
  await app.register(registerTransactionRoutes);
  await app.register(registerCategoryRoutes);
  await app.register(registerAccountRoutes);
  await app.register(registerBudgetRoutes);
  await app.register(registerMessageRoutes);
  await app.register(registerAutomationRoutes);
  await app.register(registerAttachmentRoutes);
  await app.register(registerImportRoutes);
  await app.register(registerSettingsRoutes);
  await app.register(registerAiRoutes);
  await app.register(registerWebsocketRoutes);

  app.addHook("onClose", async () => {
    await realtime.stop();
  });

  return app;
}
