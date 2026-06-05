<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { apiBaseUrl, api, getToken } from "@/api/client";
import { useRealtimeStore } from "@/stores/realtime";
import { formatDate } from "@/utils/format";
import AttachmentThumbnail from "@/components/AttachmentThumbnail.vue";

interface AttachmentRow {
  id: string;
  fileName: string;
  status: string;
  mimeType: string;
  createdAt: string;
}

const router = useRouter();
const realtime = useRealtimeStore();

const list = ref<AttachmentRow[]>([]);
const error = ref("");
const uploading = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const cameraInputRef = ref<HTMLInputElement | null>(null);

/** `capture=` is only useful on real phones; desktop browsers ignore it and show the same picker as „Datei wählen“. */
const showCameraButton = computed(() => {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const looksMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrow = window.matchMedia?.("(max-width: 640px)")?.matches ?? false;
  return looksMobile && (coarsePointer || narrow);
});

async function loadList(): Promise<void> {
  try {
    const res = await api<{ attachments: AttachmentRow[] }>("/attachments");
    list.value = res.attachments;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Liste konnte nicht geladen werden";
  }
}

onMounted(() => void loadList());

watch(
  () => realtime.lastEvent,
  (ev) => {
    if (ev?.entityType === "attachment") void loadList();
  },
);

function statusColor(status: string): string {
  if (status === "processed") return "success";
  if (status === "processing") return "info";
  if (status === "failed") return "error";
  return "warning";
}

async function postFile(file: File): Promise<void> {
  uploading.value = true;
  error.value = "";
  try {
    const fd = new FormData();
    fd.append("kind", "receipt");
    fd.append("file", file);
    const res = await fetch(`${apiBaseUrl()}/attachments`, {
      method: "POST",
      headers: { authorization: `Bearer ${getToken()}` },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Upload fehlgeschlagen");
    await loadList();
    await router.push({ name: "attachment-detail", params: { id: data.attachment.id } });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Fehler";
  } finally {
    uploading.value = false;
  }
}

function onFilePicked(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) void postFile(file);
}

function openFilePicker(): void {
  fileInputRef.value?.click();
}

function openCameraPicker(): void {
  cameraInputRef.value?.click();
}
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-4">Belege</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Nach dem Upload startet die Analyse automatisch (Hintergrund-Job). Wenn sie fertig ist, erhältst du eine Nachricht
      mit Link zu diesem Beleg.
    </p>

    <v-alert v-if="error" type="error" density="compact" class="mb-4">{{ error }}</v-alert>

    <v-card rounded="lg" border class="mb-6">
      <v-card-text class="pa-6">
        <div class="text-h6 font-weight-bold mb-2">Beleg hinzufügen</div>
        <p class="text-body-2 text-medium-emphasis mb-4">
          <template v-if="showCameraButton">Foto oder Datei — „Foto aufnehmen“ nutzt auf dem Smartphone die Kamera.</template>
          <template v-else>PDF oder Bild per Dateiauswahl hochladen.</template>
        </p>
        <div class="d-flex flex-wrap ga-3">
          <v-btn
            v-if="showCameraButton"
            color="primary"
            size="large"
            :loading="uploading"
            prepend-icon="mdi-camera"
            @click="openCameraPicker"
          >
            Foto aufnehmen
          </v-btn>
          <v-btn color="primary" :variant="showCameraButton ? 'tonal' : 'flat'" size="large" :loading="uploading" prepend-icon="mdi-upload" @click="openFilePicker">
            Datei wählen
          </v-btn>
        </div>
        <input
          v-if="showCameraButton"
          ref="cameraInputRef"
          type="file"
          accept="image/*"
          capture="environment"
          class="d-none"
          @change="onFilePicked"
        />
        <input ref="fileInputRef" type="file" accept="image/*,.pdf,application/pdf" class="d-none" @change="onFilePicked" />
      </v-card-text>
    </v-card>

    <div class="text-subtitle-1 font-weight-bold mb-2">Alle Belege</div>
    <v-row v-if="list.length">
      <v-col v-for="a in list" :key="a.id" cols="6" sm="4" md="3" lg="2">
        <v-card rounded="lg" border class="nx-att-card" :to="{ name: 'attachment-detail', params: { id: a.id } }">
          <AttachmentThumbnail :attachment-id="a.id" :mime-type="a.mimeType" />
          <v-card-text class="pa-2 pt-1">
            <div class="text-caption text-truncate" :title="a.fileName">{{ a.fileName }}</div>
            <div class="text-caption text-medium-emphasis">{{ formatDate(a.createdAt) }}</div>
            <v-chip :color="statusColor(a.status)" size="x-small" class="mt-1" label>{{ a.status }}</v-chip>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
    <v-alert v-else type="info" variant="tonal">Noch keine Belege hochgeladen.</v-alert>
  </div>
</template>

<style scoped>
.nx-att-card {
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}
</style>
