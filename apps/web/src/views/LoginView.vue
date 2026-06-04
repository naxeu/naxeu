<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useBrandingStore } from "@/stores/branding";
import { resolveBrandingAssetUrl } from "@/utils/brandingAssets";

const router = useRouter();
const auth = useAuthStore();
const branding = useBrandingStore();

const email = ref("demo@naxeu.app");
const password = ref("demo123456");
const loading = ref(false);
const error = ref("");

const logoSrc = computed(() => resolveBrandingAssetUrl(branding.branding?.app.logo));

onMounted(() => void branding.load());

async function submit(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    await auth.login(email.value, password.value);
    await router.push({ name: "dashboard" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Login fehlgeschlagen";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <v-main>
    <v-container class="fill-height" fluid>
      <v-row justify="center" align="center">
        <v-col cols="12" sm="8" md="5" lg="4">
          <div class="text-center mb-6">
            <v-img :src="logoSrc" max-width="120" class="mx-auto mb-3" />
            <h1 class="text-h5 font-weight-bold">{{ branding.branding?.app.name ?? "Naxeu" }}</h1>
            <p class="text-medium-emphasis">{{ branding.branding?.app.tagline }}</p>
          </div>
          <v-card class="pa-4" elevation="4" rounded="lg">
            <v-card-title>Anmelden</v-card-title>
            <v-card-text>
              <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>
              <v-form @submit.prevent="submit">
                <v-text-field v-model="email" label="E-Mail" type="email" prepend-inner-icon="mdi-email" variant="outlined" />
                <v-text-field v-model="password" label="Passwort" type="password" prepend-inner-icon="mdi-lock" variant="outlined" />
                <v-btn type="submit" color="primary" block size="large" :loading="loading">Login</v-btn>
              </v-form>
              <v-alert type="info" variant="tonal" density="compact" class="mt-4">
                Demo-Login: <strong>demo@naxeu.app</strong> / <strong>demo123456</strong>
              </v-alert>
              <div class="text-center mt-3">
                <router-link to="/register">Noch kein Konto? Registrieren</router-link>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </v-main>
</template>
