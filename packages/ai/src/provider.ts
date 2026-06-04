import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, type LanguageModel } from "ai";
import type { AiProviderConfig } from "@naxeu/config";
import type { z } from "zod";

/**
 * This is the ONLY module in the whole monorepo that imports the Vercel AI SDK.
 * Business logic must go through `AiService`, never touch `ai` directly.
 */

export class MockProviderError extends Error {}

/** Builds a Vercel AI SDK language model from a provider config + model name. */
export function resolveModel(provider: AiProviderConfig, model: string): LanguageModel {
  switch (provider.type) {
    case "openai": {
      const openai = createOpenAI({ apiKey: provider.apiKey });
      return openai(model);
    }
    case "openai-compatible": {
      const openai = createOpenAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl });
      return openai(model);
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: provider.apiKey });
      return anthropic(model);
    }
    case "mock":
      throw new MockProviderError("mock provider has no language model");
    default:
      throw new Error(`Unknown provider type: ${(provider as { type: string }).type}`);
  }
}

/**
 * Calls a real model and validates the structured output against a Zod schema.
 * All AI output is validated before it leaves this package.
 */
export async function generateValidatedObject<T>(
  model: LanguageModel,
  schema: z.ZodType<T>,
  prompt: string,
  system: string,
): Promise<T> {
  const { object } = await generateObject({
    model,
    schema: schema as z.ZodType<T>,
    system,
    prompt,
  });
  return object;
}
