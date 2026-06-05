<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { apiBaseUrl, getToken } from "@/api/client";

const props = withDefaults(
  defineProps<{
    attachmentId: string;
    mimeType: string | null;
    /** `list`: small preview; `detail`: larger preview */
    variant?: "list" | "detail";
  }>(),
  { variant: "list" },
);

const objectUrl = ref<string | null>(null);
const failed = ref(false);

const maxPx = computed(() => (props.variant === "detail" ? 480 : 200));

const tryRasterThumbnail = computed(() => {
  const m = props.mimeType?.toLowerCase() ?? "";
  if (m.includes("pdf")) return false;
  return m.startsWith("image/") || m === "application/octet-stream" || m === "";
});

async function load(): Promise<void> {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = null;
  }
  failed.value = false;
  const token = getToken();
  if (!token) return;

  if (tryRasterThumbnail.value) {
    try {
      const res = await fetch(
        `${apiBaseUrl()}/attachments/${props.attachmentId}/thumbnail?max=${maxPx.value}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const blob = await res.blob();
        objectUrl.value = URL.createObjectURL(blob);
        return;
      }
    } catch {
      /* fall through */
    }
  }

  if (props.mimeType?.toLowerCase().startsWith("image/")) {
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
}

onMounted(() => void load());
watch(
  () => [props.attachmentId, props.mimeType, props.variant],
  () => void load(),
);
onUnmounted(() => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
});
</script>

<template>
  <div class="nx-att-thumb rounded" :class="variant === 'detail' ? 'nx-att-thumb--detail' : 'nx-att-thumb--list'">
    <v-img
      v-if="objectUrl"
      :src="objectUrl"
      contain
      class="nx-att-thumb__img"
      :max-height="variant === 'detail' ? 320 : 140"
    />
    <v-sheet
      v-else
      class="nx-att-thumb__placeholder d-flex align-center justify-center"
      color="surface-variant"
      rounded
    >
      <v-icon size="40" :color="failed ? 'error' : undefined">
        {{ mimeType?.toLowerCase().includes("pdf") ? "mdi-file-pdf-box" : "mdi-file-document-outline" }}
      </v-icon>
    </v-sheet>
  </div>
</template>

<style scoped>
.nx-att-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: rgb(var(--v-theme-surface-variant));
}
.nx-att-thumb--list {
  min-height: 120px;
  max-height: 148px;
}
.nx-att-thumb--detail {
  min-height: 180px;
  max-height: 340px;
}
.nx-att-thumb__img {
  width: 100%;
}
.nx-att-thumb__placeholder {
  width: 100%;
  min-height: 120px;
}
.nx-att-thumb--detail .nx-att-thumb__placeholder {
  min-height: 180px;
}
</style>
