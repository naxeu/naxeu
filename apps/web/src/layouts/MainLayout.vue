<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { useBrandingStore } from "@/stores/branding";
import { useRealtimeStore } from "@/stores/realtime";
import { resolveBrandingAssetUrl } from "@/utils/brandingAssets";

const router = useRouter();
const auth = useAuthStore();
const branding = useBrandingStore();
const realtime = useRealtimeStore();

const drawer = ref(true);
const unreadCount = ref(0);

const nav = [
  { title: "Dashboard", icon: "mdi-view-dashboard", to: "/" },
  { title: "Transaktionen", icon: "mdi-swap-horizontal", to: "/transactions" },
  { title: "Kategorien", icon: "mdi-shape", to: "/categories" },
  { title: "Budgets", icon: "mdi-chart-donut", to: "/budgets" },
  { title: "Nachrichten", icon: "mdi-bell", to: "/messages" },
  { title: "Automationen", icon: "mdi-robot", to: "/automations" },
  { title: "Import", icon: "mdi-file-upload", to: "/import" },
  { title: "Belege", icon: "mdi-paperclip", to: "/attachments" },
  { title: "Einstellungen", icon: "mdi-cog", to: "/settings" },
];

const appName = computed(() => branding.branding?.app.name ?? "Naxeu");
const logoSrc = computed(() => resolveBrandingAssetUrl(branding.branding?.app.logo));

const receiptSnackbar = ref(false);
const receiptSnackbarPath = ref("");

async function loadUnread(): Promise<void> {
  try {
    const res = await api<{ messages: Array<{ status: string }> }>("/messages?status=unread");
    unreadCount.value = res.messages.length;
  } catch {
    unreadCount.value = 0;
  }
}

function logout(): void {
  realtime.disconnect();
  auth.logout();
  void router.push({ name: "login" });
}

onMounted(async () => {
  if (!auth.user) await auth.fetchMe().catch(() => undefined);
  realtime.connect();
  await loadUnread();
});

function openReceiptSnackbar(): void {
  receiptSnackbar.value = false;
  const path = receiptSnackbarPath.value;
  if (path) void router.push(path);
}

// Refresh unread badge whenever a message event arrives over realtime.
watch(
  () => realtime.lastEvent,
  (ev) => {
    if (ev && ev.entityType === "message") void loadUnread();
    if (
      ev?.type === "message.created" &&
      ev.entityType === "message" &&
      ev.meta &&
      (ev.meta as Record<string, unknown>).type === "receipt" &&
      typeof (ev.meta as Record<string, unknown>).actionUrl === "string"
    ) {
      receiptSnackbarPath.value = (ev.meta as { actionUrl: string }).actionUrl;
      receiptSnackbar.value = true;
    }
  },
);
</script>

<template>
  <v-navigation-drawer v-model="drawer" class="nx-drawer">
    <div class="drawer-brand pa-3">
      <div class="d-flex justify-center w-100">
        <v-img :src="logoSrc" alt="" contain class="drawer-brand__logo" />
      </div>
      <p class="drawer-brand__tagline text-caption text-center mt-3 mb-0 px-1 text-wrap">
        {{ branding.branding?.app.tagline }}
      </p>
    </div>
    <v-divider />
    <v-list nav density="comfortable">
      <v-list-item
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        :prepend-icon="item.icon"
        :title="item.title"
        :exact="item.to === '/'"
      >
        <template v-if="item.to === '/messages' && unreadCount > 0" #append>
          <v-badge color="error" :content="unreadCount" inline />
        </template>
      </v-list-item>
    </v-list>
  </v-navigation-drawer>

  <v-app-bar class="nx-app-bar" flat border>
    <v-app-bar-nav-icon @click="drawer = !drawer" />
    <v-toolbar-title class="font-weight-bold">{{ appName }}</v-toolbar-title>
    <v-spacer />
    <v-chip
      :color="realtime.connected ? 'success' : 'grey'"
      size="small"
      variant="flat"
      class="mr-2"
      prepend-icon="mdi-circle"
    >
      {{ realtime.connected ? "Live" : "Offline" }}
    </v-chip>
    <v-btn icon="mdi-bell" :to="'/messages'">
      <v-badge v-if="unreadCount > 0" color="error" :content="unreadCount">
        <v-icon icon="mdi-bell" />
      </v-badge>
      <v-icon v-else icon="mdi-bell" />
    </v-btn>
    <v-btn color="primary" variant="tonal" class="mx-2" prepend-icon="mdi-plus" to="/transactions/add">
      Schnelleingabe
    </v-btn>
    <v-menu>
      <template #activator="{ props }">
        <v-btn icon="mdi-account-circle" v-bind="props" />
      </template>
      <v-list>
        <v-list-item :title="auth.user?.name ?? 'Konto'" :subtitle="auth.user?.email" />
        <v-divider />
        <v-list-item title="Abmelden" prepend-icon="mdi-logout" @click="logout" />
      </v-list>
    </v-menu>
  </v-app-bar>

  <v-main class="nx-main">
    <v-container fluid class="pa-6">
      <router-view />
    </v-container>
  </v-main>

  <v-snackbar v-model="receiptSnackbar" :timeout="12_000" color="surface-variant" location="bottom">
    <span class="text-body-2">Beleganalyse abgeschlossen.</span>
    <template #actions>
      <v-btn color="primary" variant="text" @click="openReceiptSnackbar">Zum Beleg</v-btn>
      <v-btn variant="text" @click="receiptSnackbar = false">Schließen</v-btn>
    </template>
  </v-snackbar>
</template>

<style scoped>
.drawer-brand__logo {
  flex: 0 0 auto;
  width: 100%;
  max-width: 148px;
  max-height: clamp(44px, 14vw, 80px);
}
</style>
