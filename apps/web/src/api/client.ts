const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

let authToken: string | null = localStorage.getItem("naxeu_token");

export function setToken(token: string | null): void {
  authToken = token;
  if (token) localStorage.setItem("naxeu_token", token);
  else localStorage.removeItem("naxeu_token");
}

export function getToken(): string | null {
  return authToken;
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  raw?: boolean;
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Thin typed fetch wrapper that attaches the JWT and parses JSON errors. */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (!opts.raw) headers["content-type"] = "application/json";
  if (authToken) headers["authorization"] = `Bearer ${authToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.raw ? (opts.body as BodyInit) : opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiClientError(res.status, data?.message ?? res.statusText, data?.details);
  }
  return data as T;
}

export function apiBaseUrl(): string {
  return API_URL;
}

export function wsUrl(): string {
  return import.meta.env.VITE_WS_URL ?? API_URL.replace(/^http/u, "ws");
}
