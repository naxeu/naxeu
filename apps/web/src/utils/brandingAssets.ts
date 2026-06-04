import { apiBaseUrl } from "@/api/client";

const DEFAULT_LOGO = "/brand-assets/logo.svg";

/**
 * Builds a browser-loadable URL for `logo` / `favicon` from `config/branding.yml`.
 * Paths are normally served by the API from the repo `branding/` directory at
 * `/brand-assets/…`. Legacy `/branding/…` entries (meant for the old `public/`
 * copy) are mapped to `/brand-assets/…` on the API host.
 */
export function resolveBrandingAssetUrl(path: string | undefined, fallback = DEFAULT_LOGO): string {
  const raw = (path?.trim() || fallback).trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const base = apiBaseUrl().replace(/\/$/u, "");
  let p = raw.startsWith("/") ? raw : `/${raw}`;
  if (p.startsWith("/branding/")) p = `/brand-assets/${p.slice("/branding/".length)}`;
  return `${base}${p}`;
}
