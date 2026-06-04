import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigCache } from "./index.js";

const configDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "config");

describe("loadConfig", () => {
  afterEach(() => resetConfigCache());

  it("loads and validates all YAML config files", () => {
    const cfg = loadConfig(configDir);
    expect(cfg.branding.app.name).toBe("Naxeu");
    expect(cfg.branding.app.tagline).toBe("Dein Geld im Überblick.");
    expect(cfg.ai.ai.defaultProvider).toBe("mock");
    expect(cfg.ai.ai.enabled).toBe(false);
    expect(cfg.app.workspace.defaultName).toBe("Demo Family");
  });

  it("interpolates ${ENV} placeholders", () => {
    process.env.OPENAI_API_KEY = "test-key-123";
    resetConfigCache();
    const cfg = loadConfig(configDir);
    expect(cfg.ai.ai.providers.openai?.apiKey).toBe("test-key-123");
    delete process.env.OPENAI_API_KEY;
  });
});
