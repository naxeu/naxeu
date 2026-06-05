import { z } from "zod";

/** User-confirmed column indices for `POST /imports/commit`. */
export const importCommitColumnMappingSchema = z
  .object({
    date: z.number().int().min(0),
    amount: z.number().int().min(0),
    description: z.number().int().min(0),
    /** `null` = no merchant column. */
    merchant: z.number().int().min(0).nullable(),
  })
  .refine((m) => m.date !== m.amount && m.date !== m.description && m.amount !== m.description, {
    message: "date, amount und description müssen unterschiedliche Spalten sein.",
  })
  .refine(
    (m) =>
      m.merchant === null ||
      (m.merchant !== m.date && m.merchant !== m.amount && m.merchant !== m.description),
    { message: "merchant darf nicht mit den anderen Pflichtfeldern identisch sein." },
  );
export type ImportCommitColumnMapping = z.infer<typeof importCommitColumnMappingSchema>;

export const importAnalyzeFormatSchema = z.enum(["csv", "tsv", "xlsx"]);
export type ImportAnalyzeFormat = z.infer<typeof importAnalyzeFormatSchema>;

/** AI structured guess (validated against header length in the API). */
export const importColumnMappingGuessSchema = z.object({
  dateColumn: z.number().int().min(0),
  amountColumn: z.number().int().min(0),
  descriptionColumn: z.number().int().min(0),
  merchantColumn: z.number().int().min(0).nullable(),
  confidence: z.number().min(0).max(1),
  needsUserConfirmation: z.boolean(),
  reason: z.string().optional(),
});
export type ImportColumnMappingGuess = z.infer<typeof importColumnMappingGuessSchema>;

export interface SuggestedImportColumnMapping {
  date: number | null;
  amount: number | null;
  description: number | null;
  merchant: number | null;
}

export interface TabularSheet {
  headers: string[];
  /** Data rows only (no header row). */
  rows: string[][];
  hasHeader: boolean;
  delimiter: "," | "\t" | ";";
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss");
}

/** Splits one line respecting quoted fields (delimiter `,` `;` or tab). */
export function parseDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]!;
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === delimiter) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function sniffDelimiter(firstLine: string): "," | "\t" | ";" {
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  if (tabs > 0 && tabs >= commas && tabs >= semis) return "\t";
  if (semis > commas) return ";";
  return ",";
}

function looksLikeIsoDateCell(s: string): boolean {
  const t = s.trim();
  return /^\d{4}-\d{2}-\d{2}/u.test(t) || /^\d{2}\.\d{2}\.\d{4}/u.test(t);
}

function headerKeywordScore(norm: string, keywords: readonly string[]): number {
  let s = 0;
  for (const k of keywords) {
    if (norm.includes(k)) s += 1;
  }
  return s;
}

const DATE_KEYS = ["datum", "date", "buchung", "valuta", "booking", "transaktion", "buchungstag", "value date"];
const AMOUNT_KEYS = ["betrag", "amount", "umsatz", "value", "soll", "haben", "saldo", "gutschrift", "belastung", "euro"];
const DESC_KEYS = [
  "verwendungszweck",
  "description",
  "zweck",
  "text",
  "memo",
  "details",
  "buchungstext",
  "subject",
  "notiz",
];
const MERCH_KEYS = [
  "empfanger",
  "empfänger",
  "begunstigter",
  "begünstigter",
  "payee",
  "merchant",
  "name",
  "gegenpartei",
  "counterparty",
  "partner",
  "auftraggeber",
];

export interface GuessImportColumnsResult {
  suggestion: SuggestedImportColumnMapping;
  confidence: number;
  needsUserMapping: boolean;
}

/**
 * Picks best column index per role from header names (DE/EN bank CSV heuristics).
 */
export function guessImportColumnMappingFromHeaders(headers: string[]): GuessImportColumnsResult {
  const norms = headers.map((h) => normalizeHeader(h));
  const scores = {
    date: norms.map((h) => headerKeywordScore(h, DATE_KEYS)),
    amount: norms.map((h) => headerKeywordScore(h, AMOUNT_KEYS)),
    description: norms.map((h) => headerKeywordScore(h, DESC_KEYS)),
    merchant: norms.map((h) => headerKeywordScore(h, MERCH_KEYS)),
  };

  function argmax(arr: number[]): number | null {
    let bestI: number | null = null;
    let bestV = -1;
    for (let i = 0; i < arr.length; i += 1) {
      if (arr[i]! > bestV) {
        bestV = arr[i]!;
        bestI = i;
      }
    }
    return bestV > 0 ? bestI : null;
  }

  const date = argmax(scores.date);
  const amount = argmax(scores.amount);
  const description = argmax(scores.description);
  let merchant = argmax(scores.merchant);

  const used = new Set([date, amount, description].filter((x): x is number => x !== null));
  if (merchant !== null && used.has(merchant)) {
    const second = scores.merchant
      .map((v, i) => ({ v, i }))
      .filter(({ i }) => !used.has(i))
      .sort((a, b) => b.v - a.v)[0];
    merchant = second && second.v > 0 ? second.i : null;
  }

  const parts: number[] = [];
  if (date !== null) parts.push(scores.date[date]!);
  if (amount !== null) parts.push(scores.amount[amount]!);
  if (description !== null) parts.push(scores.description[description]!);
  const confidence =
    parts.length === 0 ? 0 : Math.min(1, parts.reduce((a, b) => a + b, 0) / (parts.length * 2));

  const required = [date, amount, description].filter((x): x is number => x !== null);
  const uniqueRequired = new Set(required);
  const needsUserMapping =
    date === null ||
    amount === null ||
    description === null ||
    uniqueRequired.size < 3 ||
    confidence < 0.35;

  return {
    suggestion: { date, amount, description, merchant: merchant ?? null },
    confidence,
    needsUserMapping,
  };
}

export function guessHasHeaderRow(firstRow: string[], secondRow: string[] | undefined): boolean {
  if (secondRow === undefined) return true;
  const firstLooksData =
    looksLikeIsoDateCell(firstRow[0] ?? "") &&
    /-?\d/u.test((firstRow[1] ?? "").replace(/[^\d.,-]/gu, ""));
  if (firstLooksData) return false;
  const normJoined = firstRow.map((c) => normalizeHeader(c)).join(" ");
  const headerish =
    DATE_KEYS.some((k) => normJoined.includes(k)) ||
    AMOUNT_KEYS.some((k) => normJoined.includes(k)) ||
    DESC_KEYS.some((k) => normJoined.includes(k));
  return headerish || !firstLooksData;
}

/** Parses delimited text into headers + data rows. */
export function parseDelimitedText(text: string, forcedDelimiter?: "," | "\t" | ";"): TabularSheet {
  const lines = text.split(/\r?\n/u).map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [], hasHeader: true, delimiter: "," };
  }
  const delimiter = forcedDelimiter ?? sniffDelimiter(lines[0]!);
  const row0 = parseDelimitedLine(lines[0]!, delimiter);
  const row1 = lines[1] ? parseDelimitedLine(lines[1]!, delimiter) : undefined;
  const hasHeader = guessHasHeaderRow(row0, row1);
  const headers = hasHeader ? row0.map((c) => c.trim()) : row0.map((_, i) => `Spalte ${i + 1}`);
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows = dataLines.map((ln) => parseDelimitedLine(ln, delimiter).map((c) => c.trim()));
  return { headers, rows, hasHeader, delimiter };
}

export function padRow(row: string[], width: number): string[] {
  const out = row.slice();
  while (out.length < width) out.push("");
  return out;
}
