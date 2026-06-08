const BELEG = "Beleg";

function hasBeleg(s: string | null | undefined): boolean {
  return (s ?? "").toLowerCase().includes(BELEG.toLowerCase());
}

/** Titelzeile (merchant_name) für die Beleg-Eltern-Transaktion. */
export function formatReceiptShellMerchantName(fileName: string, merchantFromExtract: string | null | undefined): string {
  const m = merchantFromExtract?.trim();
  if (!m) return `${BELEG} (${fileName})`;
  if (hasBeleg(m)) return m;
  return `${BELEG} · ${m}`;
}

/** Beschreibung für die Beleg-Eltern-Transaktion. */
export function formatReceiptShellDescription(fileName: string, baseDescription?: string | null): string {
  const d = baseDescription?.trim();
  if (!d) return `${BELEG} ${fileName}`;
  if (hasBeleg(d)) return d;
  return `${BELEG} · ${d}`;
}
