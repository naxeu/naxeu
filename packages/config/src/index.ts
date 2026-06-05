import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { config as dotenvConfig } from "dotenv";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { interpolateEnv } from "./interpolate-env.js";

function loadYamlFile(dir: string, file: string): unknown {
  const raw = readFileSync(join(dir, file), "utf8");
  return interpolateEnv(parseYaml(raw));
}

// --- branding.yml -------------------------------------------------------
export const brandingSchema = z.object({
  app: z.object({
    name: z.string(),
    tagline: z.string(),
    englishTagline: z.string(),
    logo: z.string(),
    favicon: z.string(),
  }),
  theme: z.object({
    primaryColor: z.string(),
    accentColor: z.string(),
    darkModeDefault: z.boolean(),
  }),
  domains: z.object({
    website: z.string(),
    app: z.string(),
    cloud: z.string(),
  }),
  email: z.object({
    fromName: z.string(),
    fromAddress: z.string(),
  }),
  legal: z.object({
    imprintUrl: z.string(),
    privacyUrl: z.string(),
  }),
});
export type BrandingConfig = z.infer<typeof brandingSchema>;

// --- ai.yml -------------------------------------------------------------
const aiProviderSchema = z.object({
  type: z.enum(["mock", "openai", "anthropic", "openai-compatible"]),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

const aiTaskSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

export const aiConfigSchema = z.object({
  ai: z.object({
    enabled: z.boolean(),
    defaultProvider: z.string(),
    providers: z.record(aiProviderSchema),
    tasks: z.object({
      quickInputParsing: aiTaskSchema,
      transactionCategorization: aiTaskSchema,
      attachmentExtraction: aiTaskSchema,
      monthlySummary: aiTaskSchema,
      importColumnMapping: aiTaskSchema,
    }),
  }),
});
export type AiConfig = z.infer<typeof aiConfigSchema>;
export type AiProviderConfig = z.infer<typeof aiProviderSchema>;
export type AiTaskName = keyof AiConfig["ai"]["tasks"];

function cleanEnvString(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const t = s.trim();
  return t === "" ? undefined : t;
}

/**
 * After `${VAR}` / `${VAR:-default}` interpolation, missing env vars become `""`. Treat those as
 * unset for optional provider fields, and keep stable defaults for the
 * `local` (Ollama-compatible) provider.
 */
function normalizeAiAfterInterpolation(parsed: AiConfig): AiConfig {
  const providers: Record<string, z.infer<typeof aiProviderSchema>> = {};
  for (const [id, p] of Object.entries(parsed.ai.providers)) {
    const apiKey = cleanEnvString(p.apiKey);
    const baseUrl = cleanEnvString(p.baseUrl);

    if (id === "local" && p.type === "openai-compatible") {
      providers[id] = {
        type: "openai-compatible",
        baseUrl: baseUrl ?? "http://localhost:11434/v1",
        apiKey: apiKey ?? "local",
      };
    } else {
      providers[id] = {
        type: p.type,
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
      };
    }
  }
  return aiConfigSchema.parse({
    ai: {
      ...parsed.ai,
      providers,
    },
  });
}

/** Must match `aiConfigSchema` shape `ai.tasks` keys. */
const AI_TASK_KEYS = [
  "quickInputParsing",
  "transactionCategorization",
  "attachmentExtraction",
  "monthlySummary",
  "importColumnMapping",
] as const satisfies readonly AiTaskName[];

/** Parses `AI_ENABLED`; unknown values leave the YAML setting unchanged. */
function optionalEnvBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.trim();
  if (v === "") return undefined;
  const l = v.toLowerCase();
  if (["1", "true", "yes", "on"].includes(l)) return true;
  if (["0", "false", "no", "off"].includes(l)) return false;
  return undefined;
}

/**
 * After YAML parse + `${VAR}` / `${VAR:-def}` interpolation, scalars may still be
 * strings (e.g. `enabled: "true"`). Coerce to the shapes expected by {@link aiConfigSchema}.
 */
function coerceAiYamlForSchema(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const root = raw as Record<string, unknown>;
  const ai = root.ai;
  if (!ai || typeof ai !== "object") return raw;
  const a = ai as Record<string, unknown>;

  const toBool = (v: unknown): boolean => {
    if (typeof v === "boolean") return v;
    if (typeof v !== "string") return false;
    return optionalEnvBool(v) === true;
  };

  const toScalar = (v: unknown, emptyAs: string): string => {
    if (typeof v !== "string") return emptyAs;
    const t = v.trim();
    return t === "" ? emptyAs : t;
  };

  const tasksIn = (a.tasks && typeof a.tasks === "object" ? a.tasks : {}) as Record<
    string,
    Record<string, unknown>
  >;
  const tasksOut: Record<string, { provider: string; model: string }> = {};
  for (const key of AI_TASK_KEYS) {
    const row = tasksIn[key];
    if (!row || typeof row !== "object") {
      tasksOut[key] = { provider: "mock", model: "mock" };
      continue;
    }
    tasksOut[key] = {
      provider: toScalar(row.provider, "mock"),
      model: toScalar(row.model, "mock"),
    };
  }

  return {
    ...root,
    ai: {
      ...a,
      enabled: toBool(a.enabled),
      defaultProvider: toScalar(a.defaultProvider, "mock"),
      providers: a.providers,
      tasks: tasksOut,
    },
  };
}

/**
 * Applies defaults and global rules after `ai.yml` + env interpolation.
 *
 * - If `ai.defaultProvider` is a live provider, tasks still on `mock` inherit it
 *   (per-task `${AI_TASK_*}` in YAML already wins when non-mock).
 * - Live provider + model still `mock` → sensible default model.
 * - Infers `enabled: true` when a live default or task provider is configured,
 *   unless `AI_ENABLED` is explicitly false in the **process environment** (so
 *   `AI_ENABLED=` in `.env` still allows inference; only `false`/`0`/… blocks it).
 */
function defaultModelForProviderId(
  providerId: string,
  providers: AiConfig["ai"]["providers"],
): string {
  const p = providers[providerId];
  if (!p) return "gpt-4o-mini";
  switch (p.type) {
    case "mock":
      return "mock";
    case "anthropic":
      return "claude-3-5-haiku-20241022";
    case "openai":
      return "gpt-4o-mini";
    case "openai-compatible":
      return "llama3.2";
    default:
      return "gpt-4o-mini";
  }
}

function providerIsNonMock(
  providers: AiConfig["ai"]["providers"],
  providerId: string,
): boolean {
  const p = providers[providerId];
  return Boolean(p && p.type !== "mock");
}

function anyTaskUsesNonMockProvider(
  tasks: AiConfig["ai"]["tasks"],
  providers: AiConfig["ai"]["providers"],
): boolean {
  return AI_TASK_KEYS.some((key) => providerIsNonMock(providers, tasks[key].provider));
}

/** If a task points at a real provider but the model is still the YAML placeholder `mock`, pick a sane default (per-task env often sets only `*_PROVIDER`). */
function ensureLiveTasksHaveNonMockModel(
  tasks: AiConfig["ai"]["tasks"],
  providers: AiConfig["ai"]["providers"],
): AiConfig["ai"]["tasks"] {
  let next = tasks;
  for (const key of AI_TASK_KEYS) {
    const t = next[key];
    if (t.model !== "mock") continue;
    if (!providerIsNonMock(providers, t.provider)) continue;
    next = {
      ...next,
      [key]: { ...t, model: defaultModelForProviderId(t.provider, providers) },
    };
  }
  return next;
}

function applyAiDerivedRules(parsed: AiConfig): AiConfig {
  /** Only used to detect explicit opt-out; values otherwise come from `ai.yml` + `${…}`. */
  const enabledEnv = optionalEnvBool(process.env.AI_ENABLED);

  let tasks = parsed.ai.tasks;

  if (
    parsed.ai.defaultProvider !== "mock" &&
    providerIsNonMock(parsed.ai.providers, parsed.ai.defaultProvider)
  ) {
    for (const key of AI_TASK_KEYS) {
      const t = tasks[key];
      if (t.provider !== "mock") continue;
      const nextModel =
        t.model === "mock"
          ? defaultModelForProviderId(parsed.ai.defaultProvider, parsed.ai.providers)
          : t.model;
      tasks = {
        ...tasks,
        [key]: { ...t, provider: parsed.ai.defaultProvider, model: nextModel },
      };
    }
  }

  tasks = ensureLiveTasksHaveNonMockModel(tasks, parsed.ai.providers);

  let outAi: AiConfig["ai"] = {
    ...parsed.ai,
    tasks,
  };

  if (enabledEnv !== false) {
    const providers = parsed.ai.providers;
    const anyLiveTask = anyTaskUsesNonMockProvider(tasks, providers);
    const defId = outAi.defaultProvider;
    const defaultLive = defId !== "mock" && providerIsNonMock(providers, defId);
    if (!outAi.enabled && (anyLiveTask || defaultLive)) {
      outAi = { ...outAi, enabled: true };
    }
  }

  if (enabledEnv === false) {
    outAi = { ...outAi, enabled: false };
  }

  return { ai: outAi };
}

// --- app.yml ------------------------------------------------------------
export const appConfigSchema = z.object({
  edition: z.string().default("community"),
  workspace: z.object({
    defaultName: z.string(),
    defaultType: z.string(),
    allowMultiple: z.boolean(),
  }),
  auth: z.object({
    tokenTtl: z.string(),
    allowRegistration: z.boolean(),
  }),
  budgets: z.object({
    defaultAlertThreshold: z.number(),
  }),
  messages: z.object({
    defaultDeliveryPolicy: z.string(),
    defaultChannels: z.array(z.string()),
  }),
  worker: z.object({
    pollIntervalMs: z.number(),
    maxAutomationDepth: z.number(),
  }),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

export interface NaxeuConfig {
  app: AppConfig;
  ai: AiConfig;
  branding: BrandingConfig;
}

/** Directory holding the YAML config files (defaults to repo-root /config). */
export function configDir(): string {
  return process.env.CONFIG_DIR ?? join(process.cwd(), "config");
}

let cached: NaxeuConfig | null = null;
let dotenvBootstrapped = false;

/** Loads repo-root `.env` into `process.env` (once) so local `pnpm dev:*` picks up AI_* without exporting in the shell. Skipped under Vitest/CI. */
function ensureDotenvLoaded(): void {
  if (dotenvBootstrapped) return;
  dotenvBootstrapped = true;
  if (process.env.VITEST === "true" || process.env.CI === "true") return;

  let cur = process.cwd();
  for (let i = 0; i < 10; i++) {
    const envPath = join(cur, ".env");
    if (existsSync(envPath)) {
      dotenvConfig({ path: envPath });
      return;
    }
    const parent = resolve(cur, "..");
    if (parent === cur) break;
    cur = parent;
  }
}

/** Loads, interpolates and validates all YAML config files (memoised). */
export function loadConfig(dir: string = configDir()): NaxeuConfig {
  if (cached) return cached;
  ensureDotenvLoaded();
  const aiYaml = aiConfigSchema.parse(coerceAiYamlForSchema(loadYamlFile(dir, "ai.yml")));
  const aiNormalized = normalizeAiAfterInterpolation(aiYaml);
  cached = {
    app: appConfigSchema.parse(loadYamlFile(dir, "app.yml")),
    ai: applyAiDerivedRules(aiNormalized),
    branding: brandingSchema.parse(loadYamlFile(dir, "branding.yml")),
  };
  return cached;
}

/** Test helper to clear the memoised config. */
export function resetConfigCache(): void {
  cached = null;
  dotenvBootstrapped = false;
}
