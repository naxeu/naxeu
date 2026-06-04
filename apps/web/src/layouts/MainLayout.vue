<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { useBrandingStore } from "@/stores/branding";
import { useRealtimeStore } from "@/stores/realtime";

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

// Refresh unread badge whenever a message event arrives over realtime.
watch(
  () => realtime.lastEvent,
  (ev) => {
    if (ev && ev.entityType === "message") void loadUnread();
  },
);
</script>

<template>
  <v-navigation-drawer v-model="drawer" color="grey-lighten-5">
    <div class="pa-4 d-flex align-center ga-2">
      <v-img src="/branding/logo.svg" max-width="36" height="36" />
      <div>
        <div class="text-h6 font-weight-bold">{{ appName }}</div>
        <div class="text-caption text-medium-emphasis">{{ branding.branding?.app.tagline }}</div>
      </div>
    </div>
    <v-divider />
    <v-list nav density="comfortable">
      <v-list-item
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        :prepend-icon="item.icon"
        :title="item.title"
        exact
      >
        <template v-if="item.to === '/messages' && unreadCount > 0" #append>
          <v-badge color="error" :content="unreadCount" inline />
        </template>
      </v-list-item>
    </v-list>
  </v-navigation-drawer>

  <v-app-bar flat border>
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

  <v-main>
    <v-container fluid class="pa-6">
      <router-view />
    </v-container>
  </v-main>
</template>
