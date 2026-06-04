export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Returns the [first, last] day (YYYY-MM-DD) of a YYYY-MM month. */
export function monthRange(month: string): [string, string] {
  const [y, m] = month.split("-").map((n) => Number.parseInt(n, 10));
  const first = `${month}-01`;
  const lastDay = new Date(y ?? 1970, m ?? 1, 0).getDate();
  const last = `${month}-${String(lastDay).padStart(2, "0")}`;
  return [first, last];
}

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  const num = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(num)) return "–";
  return eur.format(num);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "–";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("de-DE");
}

export const severityColor: Record<string, string> = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
  critical: "error",
};

export const statusColor: Record<string, string> = {
  draft: "grey",
  pending_review: "warning",
  confirmed: "success",
  ignored: "grey",
  archived: "grey",
};
