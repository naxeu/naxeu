/**
 * Money helpers. All amounts are stored as decimal strings in the DB. To avoid
 * floating point drift we do arithmetic on integer cents internally.
 */

export function toCents(amount: string | number): number {
  const value = typeof amount === "number" ? amount : Number.parseFloat(amount);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function addMoney(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}

export function sumMoney(values: Array<string | number>): string {
  return fromCents(values.reduce<number>((sum, v) => sum + toCents(v), 0));
}

export function absMoney(amount: string): string {
  return fromCents(Math.abs(toCents(amount)));
}
