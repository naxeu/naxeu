import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@naxeu/config";
import { users, workspaceMembers, workspaces } from "@naxeu/db/schema";
import { hashPassword, verifyPassword } from "@naxeu/core";
import { loginSchema, registerSchema } from "@naxeu/shared";

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;
  const appConfig = loadConfig().app;

  app.post("/auth/register", async (request, reply) => {
    if (!appConfig.auth.allowRegistration) {
      return reply.code(403).send({ error: "forbidden", message: "Registration disabled" });
    }
    const input = registerSchema.parse(request.body);

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing) {
      return reply.code(409).send({ error: "conflict", message: "Email already registered" });
    }

    const [user] = await db
      .insert(users)
      .values({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password) })
      .returning();

    // Community edition: single household. Reuse the default workspace if one
    // exists, otherwise create it and make this user the owner.
    let [workspace] = await db.select().from(workspaces).limit(1);
    let role = "member";
    if (!workspace) {
      [workspace] = await db
        .insert(workspaces)
        .values({ name: appConfig.workspace.defaultName, type: appConfig.workspace.defaultType })
        .returning();
      role = "owner";
    }
    await db.insert(workspaceMembers).values({ workspaceId: workspace!.id, userId: user!.id, role });

    const token = app.jwt.sign(
      { userId: user!.id, workspaceId: workspace!.id, email: user!.email },
      { expiresIn: appConfig.auth.tokenTtl },
    );
    return reply.code(201).send({ token, user: { id: user!.id, email: user!.email, name: user!.name } });
  });

  app.post("/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return reply.code(401).send({ error: "unauthorized", message: "Invalid credentials" });
    }
    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.id))
      .limit(1);
    if (!member) {
      return reply.code(403).send({ error: "forbidden", message: "User has no workspace" });
    }
    const token = app.jwt.sign(
      { userId: user.id, workspaceId: member.workspaceId, email: user.email },
      { expiresIn: appConfig.auth.tokenTtl },
    );
    return { token, user: { id: user.id, email: user.email, name: user.name } };
  });

  app.get("/auth/me", { preHandler: app.authenticate }, async (request) => {
    const [user] = await db.select().from(users).where(eq(users.id, request.auth.userId)).limit(1);
    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, request.auth.userId))
      .limit(1);
    return {
      user: user ? { id: user.id, email: user.email, name: user.name } : null,
      workspaceId: request.auth.workspaceId,
      role: member?.role ?? null,
    };
  });
}
