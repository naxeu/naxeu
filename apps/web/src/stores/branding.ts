import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "@/api/client";
import { resolveBrandingAssetUrl } from "@/utils/brandingAssets";

export interface Branding {
  app: { name: string; tagline: string; englishTagline: string; logo: string; favicon: string };
  theme: { primaryColor: string; accentColor: string; darkModeDefault: boolean };
  domains: { website: string; app: string; cloud: string };
}

function applyFavicon(href: string, typeHint?: string): void {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
  const ext = typeHint ?? href.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "svg" || href.includes(".svg")) link.type = "image/svg+xml";
  else if (ext === "ico" || href.includes(".ico")) link.type = "image/x-icon";
  else link.removeAttribute("type");
}

export const useBrandingStore = defineStore("branding", () => {
  const branding = ref<Branding | null>(null);

  async function load(): Promise<void> {
    if (branding.value) return;
    try {
      const res = await api<{ branding: Branding }>("/branding");
      branding.value = res.branding;
      document.title = `${res.branding.app.name} — ${res.branding.app.tagline}`;
      applyFavicon(resolveBrandingAssetUrl(res.branding.app.favicon), res.branding.app.favicon);
    } catch {
      // Fall back to defaults if branding endpoint is unavailable.
      branding.value = {
        app: {
          name: "Naxeu",
          tagline: "Dein Geld im Überblick.",
          englishTagline: "AI-assisted finance overview for families.",
          logo: "/brand-assets/logo.svg",
          favicon: "/brand-assets/favicon.ico",
        },
        theme: { primaryColor: "#1976D2", accentColor: "#FFC107", darkModeDefault: false },
        domains: { website: "https://naxeu.com", app: "https://naxeu.app", cloud: "https://naxeu.cloud" },
      };
      applyFavicon(resolveBrandingAssetUrl(branding.value.app.favicon), branding.value.app.favicon);
    }
  }

  return { branding, load };
});
