/**
 * Resolves `${VAR}` and `${VAR:-default}` in strings against `process.env`.
 * Missing or empty (after trim) variables use the `:-` default when present;
 * otherwise they become `""` (same as legacy `${VAR}` only).
 */
export function interpolateEnv<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/gu, (_m, name: string, def?: string) => {
      const raw = process.env[name];
      const v = raw !== undefined ? raw.trim() : "";
      if (v !== "") return v;
      if (def !== undefined) return def;
      return "";
    }) as T;
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
