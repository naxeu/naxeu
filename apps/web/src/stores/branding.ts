import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "@/api/client";

export interface Branding {
  app: { name: string; tagline: string; englishTagline: string; logo: string; favicon: string };
  theme: { primaryColor: string; accentColor: string; darkModeDefault: boolean };
  domains: { website: string; app: string; cloud: string };
}

export const useBrandingStore = defineStore("branding", () => {
  const branding = ref<Branding | null>(null);

  async function load(): Promise<void> {
    if (branding.value) return;
    try {
      const res = await api<{ branding: Branding }>("/branding");
      branding.value = res.branding;
      document.title = `${res.branding.app.name} — ${res.branding.app.tagline}`;
    } catch {
      // Fall back to defaults if branding endpoint is unavailable.
      branding.value = {
        app: {
          name: "Naxeu",
          tagline: "Dein Geld im Überblick.",
          englishTagline: "AI-assisted finance overview for families.",
          logo: "/branding/logo.svg",
          favicon: "/branding/favicon.ico",
        },
        theme: { primaryColor: "#1976D2", accentColor: "#FFC107", darkModeDefault: false },
        domains: { website: "https://naxeu.com", app: "https://naxeu.app", cloud: "https://naxeu.cloud" },
      };
    }
  }

  return { branding, load };
});
