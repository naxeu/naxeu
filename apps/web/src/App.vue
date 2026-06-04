<script setup lang="ts">
import { onMounted } from "vue";
import { useBrandingStore } from "@/stores/branding";

const branding = useBrandingStore();

onMounted(() => {
  void branding.load();
});
</script>

<template>
  <v-app>
    <router-view />
  </v-app>
</template>
