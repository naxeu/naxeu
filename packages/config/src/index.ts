import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/**
 * Resolves `${VAR}` placeholders inside any string value against the current
 * process environment. Missing variables resolve to an empty string so the
 * app still boots (e.g. an unset OPENAI_API_KEY just yields "").
 */
function interpolateEnv<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Z0-9_]+)\}/gu, (_m, name: string) => process.env[name] ?? "") as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => interpolateEnv(v)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = interpolateEnv(v);
    return out as T;
  }
  return value;
}

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
    }),
  }),
});
export type AiConfig = z.infer<typeof aiConfigSchema>;
export type AiProviderConfig = z.infer<typeof aiProviderSchema>;
export type AiTaskName = keyof AiConfig["ai"]["tasks"];

/** Must match `aiConfigSchema` shape `ai.tasks` keys. */
const AI_TASK_KEYS = [
  "quickInputParsing",
  "transactionCategorization",
  "attachmentExtraction",
  "monthlySummary",
] as const satisfies readonly AiTaskName[];

function camelToUpperSnake(s: string): string {
  return s.replace(/([a-z\d])([A-Z])/g, "$1_$2").toUpperCase();
}

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
 * Overrides `config/ai.yml` from the environment (after YAML parse + `${VAR}` interpolation).
 *
 * - `AI_ENABLED` — `true` / `false` / `1` / `0` / `yes` / `no` / `on` / `off`
 * - `AI_DEFAULT_PROVIDER` — provider id (e.g. `openai`, `mock`)
 * - `AI_TASK_<UPPER_SNAKE_TASK>_PROVIDER` / `_MODEL` — e.g. `AI_TASK_QUICK_INPUT_PARSING_MODEL=gpt-4o-mini`
 */
function applyAiEnvOverrides(parsed: AiConfig): AiConfig {
  const e = process.env;
  const enabled = optionalEnvBool(e.AI_ENABLED);
  const defaultProvider =
    e.AI_DEFAULT_PROVIDER !== undefined && e.AI_DEFAULT_PROVIDER.trim() !== ""
      ? e.AI_DEFAULT_PROVIDER.trim()
      : undefined;

  let tasks = parsed.ai.tasks;
  for (const key of AI_TASK_KEYS) {
    const snake = camelToUpperSnake(key);
    const pRaw = e[`AI_TASK_${snake}_PROVIDER`];
    const mRaw = e[`AI_TASK_${snake}_MODEL`];
    const pTrim = pRaw !== undefined ? pRaw.trim() : "";
    const mTrim = mRaw !== undefined ? mRaw.trim() : "";
    if (pTrim !== "" || mTrim !== "") {
      tasks = {
        ...tasks,
        [key]: {
          ...tasks[key],
          ...(pTrim !== "" ? { provider: pTrim } : {}),
          ...(mTrim !== "" ? { model: mTrim } : {}),
        },
      };
    }
  }

  if (enabled === undefined && defaultProvider === undefined && tasks === parsed.ai.tasks) {
    return parsed;
  }

  return {
    ai: {
      ...parsed.ai,
      ...(enabled !== undefined ? { enabled } : {}),
      ...(defaultProvider !== undefined ? { defaultProvider } : {}),
      tasks,
    },
  };
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

/** Loads, interpolates and validates all YAML config files (memoised). */
export function loadConfig(dir: string = configDir()): NaxeuConfig {
  if (cached) return cached;
  const aiYaml = aiConfigSchema.parse(loadYamlFile(dir, "ai.yml"));
  cached = {
    app: appConfigSchema.parse(loadYamlFile(dir, "app.yml")),
    ai: applyAiEnvOverrides(aiYaml),
    branding: brandingSchema.parse(loadYamlFile(dir, "branding.yml")),
  };
  return cached;
}

/** Test helper to clear the memoised config. */
export function resetConfigCache(): void {
  cached = null;
}
