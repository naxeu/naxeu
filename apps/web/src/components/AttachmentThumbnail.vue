<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { apiBaseUrl, getToken } from "@/api/client";

const props = defineProps<{
  attachmentId: string;
  mimeType: string | null;
}>();

const objectUrl = ref<string | null>(null);
const failed = ref(false);

async function load(): Promise<void> {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = null;
  }
  failed.value = false;
  if (!props.mimeType?.toLowerCase().startsWith("image/")) return;
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${apiBaseUrl()}/attachments/${props.attachmentId}/file`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      failed.value = true;
      return;
    }
    const blob = await res.blob();
    objectUrl.value = URL.createObjectURL(blob);
  } catch {
    failed.value = true;
  }
}

onMounted(() => void load());
watch(
  () => [props.attachmentId, props.mimeType],
  () => void load(),
);
onUnmounted(() => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
});
</script>

<template>
  <div class="nx-att-thumb rounded">
    <v-img v-if="objectUrl" :src="objectUrl" cover aspect-ratio="1" class="nx-att-thumb__img" />
    <v-sheet
      v-else
      class="nx-att-thumb__placeholder d-flex align-center justify-center"
      color="surface-variant"
      rounded
    >
      <v-icon size="40" :color="failed ? 'error' : undefined">
        {{ mimeType?.includes("pdf") ? "mdi-file-pdf-box" : "mdi-file-document-outline" }}
      </v-icon>
    </v-sheet>
  </div>
</template>

<style scoped>
.nx-att-thumb {
  overflow: hidden;
  max-height: 140px;
}
.nx-att-thumb__img {
  min-height: 100px;
}
.nx-att-thumb__placeholder {
  min-height: 100px;
  aspect-ratio: 1;
}
</style>
