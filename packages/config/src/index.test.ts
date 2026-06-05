import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigCache } from "./index.js";

const configDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "config");

describe("loadConfig", () => {
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (
        k.startsWith("AI_") ||
        k === "OPENAI_API_KEY" ||
        k === "OPENAI_BASE_URL" ||
        k.startsWith("OLLAMA_")
      ) {
        delete process.env[k];
      }
    }
    resetConfigCache();
  });

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
    const cfg = loadConfig(configDir);
    expect(cfg.ai.ai.providers.openai?.apiKey).toBe("test-key-123");
  });

  it("drops empty interpolated strings and applies local Ollama defaults", () => {
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_API_KEY;
    const cfg = loadConfig(configDir);
    expect(cfg.ai.ai.providers.local?.baseUrl).toBe("http://localhost:11434/v1");
    expect(cfg.ai.ai.providers.local?.apiKey).toBe("local");
  });

  it("uses OLLAMA_* from the environment for the local provider", () => {
    process.env.OLLAMA_BASE_URL = "http://ollama:11434/v1";
    process.env.OLLAMA_API_KEY = "secret";
    const cfg = loadConfig(configDir);
    expect(cfg.ai.ai.providers.local?.baseUrl).toBe("http://ollama:11434/v1");
    expect(cfg.ai.ai.providers.local?.apiKey).toBe("secret");
  });

  it("passes OPENAI_BASE_URL through to the openai provider when set", () => {
    process.env.OPENAI_BASE_URL = "https://example.com/v1";
    const cfg = loadConfig(configDir);
    expect(cfg.ai.ai.providers.openai?.baseUrl).toBe("https://example.com/v1");
  });

  it("overrides ai.enabled and ai.defaultProvider from env", () => {
    process.env.AI_ENABLED = "true";
    process.env.AI_DEFAULT_PROVIDER = "openai";
    const cfg = loadConfig(configDir);
    expect(cfg.ai.ai.enabled).toBe(true);
    expect(cfg.ai.ai.defaultProvider).toBe("openai");
    expect(cfg.ai.ai.tasks.attachmentExtraction.provider).toBe("openai");
    expect(cfg.ai.ai.tasks.attachmentExtraction.model).toBe("gpt-4o-mini");
  });

  it("overrides per-task provider and model from env", () => {
    process.env.AI_TASK_QUICK_INPUT_PARSING_PROVIDER = "openai";
    process.env.AI_TASK_QUICK_INPUT_PARSING_MODEL = "gpt-4o-mini";
    const cfg = loadConfig(configDir);
    expect(cfg.ai.ai.tasks.quickInputParsing.provider).toBe("openai");
    expect(cfg.ai.ai.tasks.quickInputParsing.model).toBe("gpt-4o-mini");
    expect(cfg.ai.ai.tasks.monthlySummary.provider).toBe("mock");
    expect(cfg.ai.ai.enabled).toBe(true);
  });

  it("infers enabled and default model when only per-task provider is set (no AI_ENABLED)", () => {
    process.env.AI_TASK_ATTACHMENT_EXTRACTION_PROVIDER = "openai";
    const cfg = loadConfig(configDir);
    expect(cfg.ai.ai.enabled).toBe(true);
    expect(cfg.ai.ai.tasks.attachmentExtraction.provider).toBe("openai");
    expect(cfg.ai.ai.tasks.attachmentExtraction.model).toBe("gpt-4o-mini");
  });

  it("keeps AI off when AI_ENABLED=false even if a task names a live provider", () => {
    process.env.AI_ENABLED = "false";
    process.env.AI_TASK_ATTACHMENT_EXTRACTION_PROVIDER = "openai";
    process.env.AI_TASK_ATTACHMENT_EXTRACTION_MODEL = "gpt-4o-mini";
    const cfg = loadConfig(configDir);
    expect(cfg.ai.ai.enabled).toBe(false);
  });
});
