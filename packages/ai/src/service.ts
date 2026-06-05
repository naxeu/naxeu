import type { AiConfig, AiTaskName } from "@naxeu/config";
import {
  categorizationSchema,
  extractedAttachmentSchema,
  importColumnMappingGuessSchema,
  monthlySummarySchema,
  parsedQuickInputSchema,
  guessImportColumnMappingFromHeaders,
  type CategorizationResult,
  type ExtractedAttachment,
  type ImportColumnMappingGuess,
  type MonthlySummary,
  type ParsedQuickInput,
} from "@naxeu/shared";
import {
  heuristicCategorize,
  heuristicExtractAttachment,
  heuristicParseQuickInput,
} from "./heuristics.js";
import {
  generateValidatedObject,
  generateValidatedObjectWithMessages,
  resolveModel,
} from "./provider.js";

/** Lists workspace budget categories for receipt extraction prompts. */
export function formatBudgetCategoriesForPrompt(names: readonly string[]): string {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  if (unique.length === 0) {
    return "There are no expense budget categories in this workspace yet. Set categoryHint to null for every line item.";
  }
  return [
    "Allowed values for each line item's categoryHint (verbatim copy of exactly ONE list entry — pick the single best-fitting category for that product or service; use null only if none of these fits at all):",
    ...unique.map((n) => `- ${n}`),
  ].join("\n");
}

function clampImportColumnGuess(g: ImportColumnMappingGuess, n: number): ImportColumnMappingGuess {
  if (n <= 0) return { ...g, needsUserConfirmation: true };
  const c = (i: number) => Math.max(0, Math.min(n - 1, i));
  const d = c(g.dateColumn);
  const a = c(g.amountColumn);
  const desc = c(g.descriptionColumn);
  const m = g.merchantColumn === null ? null : c(g.merchantColumn);
  const dupCore = d === a || d === desc || a === desc;
  const badMerchant = m !== null && (m === d || m === a || m === desc);
  return {
    ...g,
    dateColumn: d,
    amountColumn: a,
    descriptionColumn: desc,
    merchantColumn: badMerchant ? null : m,
    needsUserConfirmation: g.needsUserConfirmation || dupCore || badMerchant,
  };
}

export interface CategorizeInput {
  merchantName?: string | null;
  description?: string | null;
  amount?: string | null;
}

export interface SummaryInput {
  month: string;
  totalIncome: string;
  totalExpense: string;
  topCategories: Array<{ name: string; amount: string }>;
}

/** Whether Beleg-Extraktion used a real LLM vs. heuristics (API responses surface this). */
export type AttachmentExtractionSource = "model" | "heuristic";

/**
 * Fachliche AI-Schicht. Business logic talks to this class only; it never sees
 * the Vercel AI SDK. When AI is disabled or a task uses the `mock` provider, we
 * fall back to deterministic heuristics so the MVP runs with no API key.
 *
 * Every model output is validated with Zod before being returned.
 */
export class AiService {
  constructor(private readonly config: AiConfig) {}

  static fromConfig(config: AiConfig): AiService {
    return new AiService(config);
  }

  /** Whether a given task should use a real model vs. the mock heuristic. */
  private usesMock(task: AiTaskName): boolean {
    if (!this.config.ai.enabled) return true;
    const taskCfg = this.config.ai.tasks[task];
    const provider = this.config.ai.providers[taskCfg.provider];
    return !provider || provider.type === "mock";
  }

  private resolveTaskModel(task: AiTaskName) {
    const taskCfg = this.config.ai.tasks[task];
    const provider = this.config.ai.providers[taskCfg.provider];
    if (!provider) throw new Error(`Unknown AI provider: ${taskCfg.provider}`);
    return resolveModel(provider, taskCfg.model);
  }

  /**
   * Suggests which table columns hold date, amount, description, merchant.
   * Uses heuristics when AI is off; with a live model, tries structured JSON first.
   */
  async guessImportColumnMapping(
    headers: string[],
    sampleDataRows: string[][],
  ): Promise<ImportColumnMappingGuess> {
    const heuristic = guessImportColumnMappingFromHeaders(headers);
    if (this.usesMock("importColumnMapping")) {
      return {
        dateColumn: heuristic.suggestion.date ?? 0,
        amountColumn: heuristic.suggestion.amount ?? 0,
        descriptionColumn: heuristic.suggestion.description ?? 0,
        merchantColumn: heuristic.suggestion.merchant,
        confidence: heuristic.confidence,
        needsUserConfirmation: heuristic.needsUserMapping,
      };
    }
    try {
      const model = this.resolveTaskModel("importColumnMapping");
      const headerJson = JSON.stringify(headers);
      const sampleJson = JSON.stringify(sampleDataRows.slice(0, 10));
      const raw = await generateValidatedObject(
        model,
        importColumnMappingGuessSchema,
        `CSV/Excel table headers (0..n-1 columns): ${headerJson}\nSample data rows (arrays of cell strings in header order): ${sampleJson}`,
        "Map banking export columns. dateColumn = booking date. amountColumn = transaction amount (may be signed). descriptionColumn = memo / reference / purpose. merchantColumn = counterparty or payee if clearly separate, else null. Indices are 0-based. Set needsUserConfirmation true if ambiguous or headers are not in German/English.",
      );
      return clampImportColumnGuess(raw, headers.length);
    } catch {
      return {
        dateColumn: heuristic.suggestion.date ?? 0,
        amountColumn: heuristic.suggestion.amount ?? 0,
        descriptionColumn: heuristic.suggestion.description ?? 0,
        merchantColumn: heuristic.suggestion.merchant,
        confidence: heuristic.confidence,
        needsUserConfirmation: true,
      };
    }
  }

  async parseQuickTransactionInput(input: string): Promise<ParsedQuickInput> {
    if (this.usesMock("quickInputParsing")) {
      return heuristicParseQuickInput(input);
    }
    try {
      const model = this.resolveTaskModel("quickInputParsing");
      return await generateValidatedObject(
        model,
        parsedQuickInputSchema,
        `Parse this quick finance entry into structured data: "${input}"`,
        "You extract structured transaction data. Amount is always positive; use type to indicate income vs expense. Respond strictly in the schema.",
      );
    } catch {
      // Any model/validation failure degrades gracefully to the heuristic.
      return heuristicParseQuickInput(input);
    }
  }

  async categorizeTransaction(tx: CategorizeInput): Promise<CategorizationResult> {
    const text = [tx.merchantName, tx.description].filter(Boolean).join(" ");
    if (this.usesMock("transactionCategorization")) {
      const { categoryName, confidence } = heuristicCategorize(text);
      return { categoryName, categoryId: null, confidence };
    }
    try {
      const model = this.resolveTaskModel("transactionCategorization");
      return await generateValidatedObject(
        model,
        categorizationSchema,
        `Suggest a budget category for this transaction: ${text} (amount ${tx.amount ?? "?"})`,
        "You assign a household budget category name. Return null if unsure.",
      );
    } catch {
      const { categoryName, confidence } = heuristicCategorize(text);
      return { categoryName, categoryId: null, confidence };
    }
  }

  async extractAttachment(args: {
    fileName: string;
    extractedText?: string | null;
    /** Raw file bytes for vision (typically an image/jpeg or image/png receipt photo). */
    imageBytes?: Buffer | Uint8Array | null;
    mimeType?: string | null;
    /** Workspace expense category names — model picks best-fitting list entry per line item (verbatim). */
    budgetCategoryNames?: readonly string[] | null;
  }): Promise<{ extracted: ExtractedAttachment; source: AttachmentExtractionSource }> {
    if (this.usesMock("attachmentExtraction")) {
      return {
        extracted: heuristicExtractAttachment(args.fileName, args.extractedText),
        source: "heuristic",
      };
    }
    const mime = (args.mimeType ?? "").toLowerCase();
    const canVision =
      mime.startsWith("image/") &&
      args.imageBytes != null &&
      args.imageBytes.byteLength > 0 &&
      args.imageBytes.byteLength <= 20 * 1024 * 1024;

    try {
      const model = this.resolveTaskModel("attachmentExtraction");
      const categoryBlock = formatBudgetCategoriesForPrompt(args.budgetCategoryNames ?? []);
      const system =
        "You extract receipt or invoice data into structured line items. Read amounts and dates from the document. Amounts are positive strings with exactly 2 decimal places. " +
        "For every line item you MUST choose the single best-matching budget category from the list in the user message: set categoryHint to that entry's text with identical spelling and casing (verbatim). " +
        "If and only if no category in the list is a reasonable fit for that line, set categoryHint to null. Never invent a category name that is not in the list.";

      if (canVision) {
        const hints: string[] = [`File name: ${args.fileName}`];
        const ocr = args.extractedText?.trim();
        if (ocr) hints.push(`Pre-extracted text / OCR (may be incomplete):\n${ocr}`);
        hints.push(
          "Extract merchant, date, total, currency, and line items from the receipt image. Use the image as the source of truth.",
        );
        hints.push(categoryBlock);
        hints.push(
          "For each line item, pick the single best-matching category from that bulleted list and copy that label verbatim into categoryHint (or null if none fits).",
        );
        const extracted = (await generateValidatedObjectWithMessages(
          model,
          extractedAttachmentSchema,
          system,
          [
            {
              role: "user",
              content: [
                { type: "text", text: hints.join("\n\n") },
                { type: "image", image: args.imageBytes!, mimeType: mime || undefined },
              ],
            },
          ],
        )) as ExtractedAttachment;
        return { extracted, source: "model" };
      }

      const extracted = (await generateValidatedObject(
        model,
        extractedAttachmentSchema,
        `${categoryBlock}\n\nExtract merchant, date, total and line items from this receipt text:\n${args.extractedText ?? args.fileName}`,
        system,
      )) as ExtractedAttachment;
      return { extracted, source: "model" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        "[naxeu][AiService.extractAttachment]",
        JSON.stringify({
          canVision,
          mime,
          message,
        }),
      );
      return {
        extracted: heuristicExtractAttachment(args.fileName, args.extractedText),
        source: "heuristic",
      };
    }
  }

  /** Suggests an automation rule from a transaction (heuristic-friendly). */
  suggestAutomationRule(tx: CategorizeInput): {
    name: string;
    merchantContains: string | null;
    suggestedCategory: string | null;
  } {
    const merchant = (tx.merchantName ?? "").toLowerCase().trim();
    const { categoryName } = heuristicCategorize([tx.merchantName, tx.description].join(" "));
    return {
      name: merchant ? `Auto-categorise ${merchant}` : "Auto-categorise",
      merchantContains: merchant || null,
      suggestedCategory: categoryName,
    };
  }

  async summarizeMonth(input: SummaryInput): Promise<MonthlySummary> {
    if (this.usesMock("monthlySummary")) {
      const net = (
        Number.parseFloat(input.totalIncome) - Number.parseFloat(input.totalExpense)
      ).toFixed(2);
      const top = input.topCategories
        .slice(0, 3)
        .map((c) => `${c.name} (${c.amount} €)`)
        .join(", ");
      return {
        summary: `Im Monat ${input.month} standen Einnahmen von ${input.totalIncome} € Ausgaben von ${input.totalExpense} € gegenüber (Saldo ${net} €).`,
        highlights: [
          `Saldo: ${net} €`,
          top ? `Top-Kategorien: ${top}` : "Noch keine Ausgaben erfasst.",
        ],
      };
    }
    try {
      const model = this.resolveTaskModel("monthlySummary");
      return await generateValidatedObject(
        model,
        monthlySummarySchema,
        `Summarise household finances for ${input.month}: income ${input.totalIncome}, expense ${input.totalExpense}, top categories ${JSON.stringify(input.topCategories)}.`,
        "You write a short friendly German monthly finance summary with a few highlights.",
      );
    } catch {
      const net = (
        Number.parseFloat(input.totalIncome) - Number.parseFloat(input.totalExpense)
      ).toFixed(2);
      return { summary: `Saldo ${net} € im Monat ${input.month}.`, highlights: [] };
    }
  }
}
