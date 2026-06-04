<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useBrandingStore } from "@/stores/branding";
import { resolveBrandingAssetUrl } from "@/utils/brandingAssets";

const router = useRouter();
const auth = useAuthStore();
const branding = useBrandingStore();

const name = ref("");
const email = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");

const logoSrc = computed(() => resolveBrandingAssetUrl(branding.branding?.app.logo));

onMounted(() => void branding.load());

async function submit(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    await auth.register(name.value, email.value, password.value);
    await router.push({ name: "dashboard" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Registrierung fehlgeschlagen";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <v-main class="nx-auth">
    <v-container class="fill-height" fluid>
      <v-row justify="center" align="center">
        <v-col cols="12" sm="8" md="5" lg="4">
          <div class="text-center mb-6">
            <v-img :src="logoSrc" max-width="120" class="mx-auto mb-3" />
            <h1 class="text-h5 font-weight-bold">Konto erstellen</h1>
          </div>
          <v-card class="pa-4 nx-card-elevated">
            <v-card-text>
              <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>
              <v-form @submit.prevent="submit">
                <v-text-field v-model="name" label="Name" prepend-inner-icon="mdi-account" variant="outlined" />
                <v-text-field v-model="email" label="E-Mail" type="email" prepend-inner-icon="mdi-email" variant="outlined" />
                <v-text-field v-model="password" label="Passwort (min. 8 Zeichen)" type="password" prepend-inner-icon="mdi-lock" variant="outlined" />
                <v-btn type="submit" color="primary" block size="large" :loading="loading">Registrieren</v-btn>
              </v-form>
              <div class="text-center mt-3">
                <router-link to="/login">Zurück zum Login</router-link>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </v-main>
</template>
