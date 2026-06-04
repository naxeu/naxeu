<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { api } from "@/api/client";
import { useRealtimeStore } from "@/stores/realtime";
import { formatDate, severityColor } from "@/utils/format";

interface Msg {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  status: string;
  createdAt: string;
  deliveredVia: string | null;
}

const realtime = useRealtimeStore();
const messages = ref<Msg[]>([]);
const filterType = ref<string | null>(null);
const filterSeverity = ref<string | null>(null);

const types = ["alert", "notice", "error", "news", "budget", "automation", "import", "receipt", "ai", "security", "system"];
const severities = ["info", "success", "warning", "error", "critical"];

const tab = ref("prefs-hidden");

async function load(): Promise<void> {
  const params = new URLSearchParams();
  if (filterType.value) params.set("type", filterType.value);
  if (filterSeverity.value) params.set("severity", filterSeverity.value);
  const res = await api<{ messages: Msg[] }>(`/messages?${params.toString()}`);
  messages.value = res.messages;
}

async function markRead(m: Msg): Promise<void> {
  await api(`/messages/${m.id}/read`, { method: "PUT" });
  await load();
}
async function dismiss(m: Msg): Promise<void> {
  await api(`/messages/${m.id}/dismiss`, { method: "PUT" });
  await load();
}

onMounted(load);
watch([filterType, filterSeverity], () => void load());
watch(
  () => realtime.lastEvent,
  (ev) => {
    if (ev && ev.entityType === "message") void load();
  },
);

// --- Preferences ---
interface Pref { messageType: string; mode: string; deliveryPolicy: string; preferredChannels: string[]; isEnabled: boolean }
const prefs = ref<Pref[]>([]);
const prefForm = ref<Pref>({ messageType: "budget", mode: "instant", deliveryPolicy: "first_success", preferredChannels: ["push", "email"], isEnabled: true });
const modes = ["instant", "digest_daily", "digest_weekly", "never"];
const policies = ["first_success", "all_channels", "in_app_only", "digest", "escalation"];
const channels = ["push", "email", "sms"];
const prefsOpen = ref(false);

async function loadPrefs(): Promise<void> {
  const res = await api<{ preferences: Pref[] }>("/message-preferences");
  prefs.value = res.preferences;
}
async function savePref(): Promise<void> {
  await api("/message-preferences", { method: "PUT", body: prefForm.value });
  await loadPrefs();
}
onMounted(loadPrefs);
void tab;
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h4 font-weight-bold">Nachrichten</h1>
      <v-spacer />
      <v-btn variant="tonal" prepend-icon="mdi-cog" @click="prefsOpen = !prefsOpen">Einstellungen</v-btn>
    </div>

    <v-expand-transition>
      <v-card v-if="prefsOpen" rounded="lg" border class="mb-4">
        <v-card-title>Benachrichtigungseinstellungen pro Typ</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12" md="3"><v-select v-model="prefForm.messageType" :items="types" label="Nachrichtentyp" variant="outlined" density="compact" /></v-col>
            <v-col cols="12" md="3"><v-select v-model="prefForm.mode" :items="modes" label="Modus" variant="outlined" density="compact" /></v-col>
            <v-col cols="12" md="3"><v-select v-model="prefForm.deliveryPolicy" :items="policies" label="Zustellrichtlinie" variant="outlined" density="compact" /></v-col>
            <v-col cols="12" md="3"><v-select v-model="prefForm.preferredChannels" :items="channels" label="Kanäle" multiple chips variant="outlined" density="compact" /></v-col>
          </v-row>
          <v-switch v-model="prefForm.isEnabled" label="Aktiviert" color="primary" />
          <v-btn color="primary" @click="savePref">Speichern</v-btn>
          <v-list density="compact" class="mt-3">
            <v-list-item v-for="p in prefs" :key="p.messageType" :title="p.messageType" :subtitle="`${p.mode} · ${p.deliveryPolicy} · ${p.preferredChannels.join(', ')}`" />
          </v-list>
        </v-card-text>
      </v-card>
    </v-expand-transition>

    <v-card rounded="lg" border class="mb-4">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" md="4"><v-select v-model="filterType" :items="types" label="Typ" variant="outlined" density="compact" hide-details clearable /></v-col>
          <v-col cols="12" md="4"><v-select v-model="filterSeverity" :items="severities" label="Severity" variant="outlined" density="compact" hide-details clearable /></v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card rounded="lg" border>
      <v-list>
        <template v-for="m in messages" :key="m.id">
          <v-list-item :class="{ 'font-weight-bold': m.status === 'unread' }">
            <template #prepend>
              <v-avatar :color="severityColor[m.severity]" size="36"><v-icon color="white">mdi-bell</v-icon></v-avatar>
            </template>
            <v-list-item-title>{{ m.title }}</v-list-item-title>
            <v-list-item-subtitle>{{ m.body }}</v-list-item-subtitle>
            <template #append>
              <div class="d-flex flex-column align-end ga-1">
                <div>
                  <v-chip :color="severityColor[m.severity]" size="x-small">{{ m.type }}</v-chip>
                  <v-chip size="x-small" class="ml-1" variant="outlined">{{ m.status }}</v-chip>
                </div>
                <small class="text-medium-emphasis">{{ formatDate(m.createdAt) }} <span v-if="m.deliveredVia">· via {{ m.deliveredVia }}</span></small>
                <div>
                  <v-btn v-if="m.status === 'unread'" size="x-small" variant="text" @click="markRead(m)">Gelesen</v-btn>
                  <v-btn v-if="m.status !== 'dismissed'" size="x-small" variant="text" @click="dismiss(m)">Verwerfen</v-btn>
                </div>
              </div>
            </template>
          </v-list-item>
          <v-divider />
        </template>
        <v-list-item v-if="messages.length === 0" title="Keine Nachrichten" />
      </v-list>
    </v-card>
  </div>
</template>
