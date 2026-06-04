import {
  type ExtractedAttachment,
  type ParsedQuickInput,
  type TransactionType,
} from "@naxeu/shared";

/**
 * Local, deterministic heuristics used when AI is disabled or no provider key
 * is configured. They cover the "quick input" parsing requirements:
 *   - detect amount
 *   - detect sign (income vs expense)
 *   - derive merchant from text
 *   - roughly suggest a category
 *
 * Examples handled:
 *   "despar 84,30 karte"        -> expense, merchant despar, 84.30
 *   "zooplus 42,90 katzenfutter"-> expense, merchant zooplus, category pets
 *   "+3250 gehalt"              -> income, 3250.00, category salary
 *   "amazon 12,99 haushalt"     -> expense, merchant amazon, category household
 */

/** Keyword -> category hint mapping used for a rough categorisation. */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Gehalt: ["gehalt", "lohn", "salary", "salär"],
  Lebensmittel: [
    "lebensmittel",
    "supermarkt",
    "despar",
    "rewe",
    "edeka",
    "lidl",
    "aldi",
    "brot",
    "milch",
  ],
  Haustiere: ["zooplus", "katzenfutter", "hundefutter", "tierarzt", "haustier", "fressnapf"],
  Haushalt: ["haushalt", "waschmittel", "amazon", "ikea", "dm", "drogerie"],
  "Auto / Mobilität": ["tanken", "benzin", "diesel", "auto", "öbb", "bahn", "ticket", "shell", "esso"],
  Kinder: ["kinder", "schule", "kindergarten", "spielzeug"],
  Freizeit: ["kino", "restaurant", "bar", "freizeit", "sport", "fitness"],
  Abos: ["netflix", "spotify", "abo", "apple", "disney", "youtube", "subscription"],
};

const KNOWN_MERCHANTS = [
  "despar",
  "zooplus",
  "amazon",
  "netflix",
  "spotify",
  "apple",
  "rewe",
  "edeka",
  "lidl",
  "aldi",
  "ikea",
  "shell",
];

/** Parses a German/European number like "84,30", "3.250,00", "12.99" or "3250". */
export function parseAmount(raw: string): number | null {
  // Grab the first contiguous numeric run (digits plus . , and spaces between).
  const match = raw.match(/[+-]?\d[\d.,\s]*\d|[+-]?\d/u);
  if (!match) return null;
  let token = match[0].replace(/\s/gu, "");

  const hasComma = token.includes(",");
  const hasDot = token.includes(".");
  if (hasComma && hasDot) {
    // The last separator is the decimal separator.
    if (token.lastIndexOf(",") > token.lastIndexOf(".")) {
      token = token.replace(/\./gu, "").replace(",", ".");
    } else {
      token = token.replace(/,/gu, "");
    }
  } else if (hasComma) {
    token = token.replace(",", ".");
  } else if (hasDot) {
    // A lone dot followed by exactly 3 digits is a thousands separator (3.250),
    // otherwise it is a decimal point (12.99).
    const afterDot = token.slice(token.lastIndexOf(".") + 1);
    if (afterDot.length === 3) token = token.replace(/\./gu, "");
  }
  const value = Number.parseFloat(token);
  return Number.isFinite(value) ? value : null;
}

function suggestCategory(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return null;
}

function deriveMerchant(text: string): string | null {
  const lower = text.toLowerCase();
  for (const merchant of KNOWN_MERCHANTS) {
    if (lower.includes(merchant)) {
      return merchant.charAt(0).toUpperCase() + merchant.slice(1);
    }
  }
  // Fallback: first word that is purely alphabetic and not a stop-word.
  const stop = new Set(["karte", "bar", "cash", "card", "gehalt", "lohn"]);
  const word = text
    .split(/\s+/u)
    .map((w) => w.trim())
    .find((w) => /^[a-zäöüß]+$/iu.test(w) && !stop.has(w.toLowerCase()));
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : null;
}

/** Heuristic implementation of quick-input parsing. */
export function heuristicParseQuickInput(input: string): ParsedQuickInput {
  const amountValue = parseAmount(input) ?? 0;
  const explicitPlus = /(^|\s)\+/u.test(input);
  const incomeKeyword = /(gehalt|lohn|salary|einkommen|gutschrift|refund|erstattung)/iu.test(input);
  const isIncome = explicitPlus || incomeKeyword;
  const type: TransactionType = isIncome ? "income" : "expense";
  const absAmount = Math.abs(amountValue);
  const merchant = deriveMerchant(input);
  const categoryHint = suggestCategory(input);

  return {
    merchantName: merchant,
    amount: absAmount.toFixed(2),
    type,
    currency: "EUR",
    description: input.trim(),
    categoryHint,
    confidence: amountValue !== 0 ? 0.6 : 0.3,
  };
}

/** Heuristic categorisation from merchant/description text. */
export function heuristicCategorize(text: string): { categoryName: string | null; confidence: number } {
  const category = suggestCategory(text);
  return { categoryName: category, confidence: category ? 0.55 : 0.2 };
}

/**
 * Mock attachment extraction. Produces a deterministic but plausible receipt
 * breakdown so the "analyze with AI" flow yields child transactions even with
 * no real model configured.
 */
export function heuristicExtractAttachment(fileName: string, text?: string | null): ExtractedAttachment {
  const merchant = deriveMerchant(text ?? fileName) ?? "Supermarkt";
  const lineItems = [
    { description: "Brot", amount: "3.20", categoryHint: "Lebensmittel" },
    { description: "Katzenfutter", amount: "12.50", categoryHint: "Haustiere" },
    { description: "Waschmittel", amount: "8.90", categoryHint: "Haushalt" },
    { description: "Lebensmittel Rest", amount: "59.70", categoryHint: "Lebensmittel" },
  ];
  const total = lineItems
    .reduce((sum, item) => sum + Number.parseFloat(item.amount), 0)
    .toFixed(2);
  return {
    merchantName: merchant,
    total,
    date: new Date().toISOString().slice(0, 10),
    currency: "EUR",
    lineItems,
    confidence: 0.5,
  };
}
