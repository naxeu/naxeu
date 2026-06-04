import type { FastifyInstance } from "fastify";
import { loadConfig } from "@naxeu/config";

export async function registerSettingsRoutes(app: FastifyInstance): Promise<void> {
  const config = loadConfig();

  // Public branding endpoint so the PWA can theme itself from config/branding.yml.
  app.get("/branding", async () => ({ branding: config.branding }));

  app.get("/settings", { preHandler: app.authenticate }, async () => ({
    edition: config.app.edition,
    workspace: config.app.workspace,
    auth: { allowRegistration: config.app.auth.allowRegistration },
    ai: { enabled: config.ai.ai.enabled, defaultProvider: config.ai.ai.defaultProvider },
    budgets: config.app.budgets,
    branding: config.branding,
  }));
}
