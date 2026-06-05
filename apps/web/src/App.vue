<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useTheme } from "vuetify";
import { useBrandingStore } from "@/stores/branding";

const branding = useBrandingStore();
const theme = useTheme();

function applyBrandingTheme(): void {
  const b = branding.branding;
  if (!b) return;
  theme.global.name.value = b.theme.darkModeDefault ? "naxeuDark" : "naxeu";
  syncDocTheme();
}

/** Vuetify puts `v-theme--dark` on `.v-application`, not on `html` — mirror dark mode on `<html>` for global CSS. */
function syncDocTheme(): void {
  const dark = theme.global.name.value === "naxeuDark";
  document.documentElement.classList.toggle("nx-theme-dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

onMounted(async () => {
  await branding.load();
  applyBrandingTheme();
});

watch(
  () => branding.branding?.theme.darkModeDefault,
  () => applyBrandingTheme(),
);

watch(
  () => theme.global.name.value,
  () => syncDocTheme(),
);
</script>

<template>
  <v-app>
    <router-view />
  </v-app>
</template>
