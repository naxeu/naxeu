<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "@/api/client";

interface Settings {
  edition: string;
  workspace: { defaultName: string; defaultType: string; allowMultiple: boolean };
  auth: { allowRegistration: boolean };
  ai: { enabled: boolean; defaultProvider: string };
  budgets: { defaultAlertThreshold: number };
  branding: {
    app: { name: string; tagline: string; englishTagline: string };
    domains: { website: string; app: string; cloud: string };
  };
}

const settings = ref<Settings | null>(null);

onMounted(async () => {
  settings.value = await api<Settings>("/settings");
});
</script>

<template>
  <div v-if="settings">
    <h1 class="text-h4 font-weight-bold mb-4">Einstellungen</h1>
    <v-row>
      <v-col cols="12" md="6">
        <v-card rounded="lg" border class="mb-4">
          <v-card-title>Edition</v-card-title>
          <v-list density="compact">
            <v-list-item title="Edition" :subtitle="settings.edition" />
            <v-list-item title="Workspace" :subtitle="settings.workspace.defaultName" />
            <v-list-item title="Registrierung erlaubt" :subtitle="String(settings.auth.allowRegistration)" />
            <v-list-item title="Standard-Warnschwelle Budget" :subtitle="`${settings.budgets.defaultAlertThreshold * 100}%`" />
          </v-list>
        </v-card>
        <v-card rounded="lg" border>
          <v-card-title>KI</v-card-title>
          <v-list density="compact">
            <v-list-item title="KI aktiviert" :subtitle="String(settings.ai.enabled)" />
            <v-list-item title="Standard-Provider" :subtitle="settings.ai.defaultProvider" />
          </v-list>
          <v-card-text class="text-medium-emphasis">
            KI wird über <code>config/ai.yml</code> konfiguriert. Im MVP läuft alles über den Mock-Provider –
            kein API-Key nötig.
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card rounded="lg" border>
          <v-card-title>Branding</v-card-title>
          <v-list density="compact">
            <v-list-item title="Name" :subtitle="settings.branding.app.name" />
            <v-list-item title="Tagline" :subtitle="settings.branding.app.tagline" />
            <v-list-item title="English" :subtitle="settings.branding.app.englishTagline" />
            <v-list-item title="Website" :subtitle="settings.branding.domains.website" />
            <v-list-item title="App" :subtitle="settings.branding.domains.app" />
            <v-list-item title="Cloud" :subtitle="settings.branding.domains.cloud" />
          </v-list>
          <v-card-text class="text-medium-emphasis">
            Branding wird in <code>config/branding.yml</code> gepflegt – nicht in der Datenbank.
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
