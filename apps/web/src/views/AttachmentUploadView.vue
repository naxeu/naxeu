<script setup lang="ts">
import { ref } from "vue";
import { apiBaseUrl, api, getToken } from "@/api/client";
import { formatMoney } from "@/utils/format";

interface Attachment { id: string; fileName: string; status: string; extractedData: Record<string, unknown> }

const file = ref<File[]>([]);
const uploading = ref(false);
const analyzing = ref(false);
const error = ref("");
const attachment = ref<Attachment | null>(null);
const children = ref<Array<{ id: string; description: string | null; amount: string }>>([]);

async function upload(): Promise<void> {
  if (!file.value[0]) return;
  uploading.value = true;
  error.value = "";
  children.value = [];
  try {
    const fd = new FormData();
    fd.append("kind", "receipt");
    fd.append("file", file.value[0]);
    const res = await fetch(`${apiBaseUrl()}/attachments`, {
      method: "POST",
      headers: { authorization: `Bearer ${getToken()}` },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Upload fehlgeschlagen");
    attachment.value = data.attachment;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Fehler";
  } finally {
    uploading.value = false;
  }
}

async function analyze(): Promise<void> {
  if (!attachment.value) return;
  analyzing.value = true;
  error.value = "";
  try {
    const res = await api<{ attachment: Attachment; children: Array<{ id: string; description: string | null; amount: string }> }>(
      `/attachments/${attachment.value.id}/analyze`,
      { method: "POST" },
    );
    attachment.value = res.attachment;
    children.value = res.children;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Fehler";
  } finally {
    analyzing.value = false;
  }
}
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-4">Belege & Anhänge</h1>
    <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>

    <v-row>
      <v-col cols="12" md="6">
        <v-card rounded="lg" border>
          <v-card-title>Beleg hochladen</v-card-title>
          <v-card-text>
            <v-file-input v-model="file" label="Datei oder Bild" variant="outlined" prepend-icon="mdi-paperclip" />
            <v-btn color="primary" :loading="uploading" prepend-icon="mdi-upload" @click="upload">Hochladen</v-btn>

            <div v-if="attachment" class="mt-4">
              <v-divider class="mb-3" />
              <div class="d-flex align-center">
                <div>
                  <div class="font-weight-bold">{{ attachment.fileName }}</div>
                  <v-chip size="small" :color="attachment.status === 'processed' ? 'success' : 'warning'">{{ attachment.status }}</v-chip>
                </div>
                <v-spacer />
                <v-btn color="secondary" :loading="analyzing" prepend-icon="mdi-robot" @click="analyze">Mit KI analysieren</v-btn>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card rounded="lg" border v-if="children.length">
          <v-card-title>Erzeugte Untertransaktionen</v-card-title>
          <v-list>
            <v-list-item v-for="c in children" :key="c.id" :title="c.description ?? 'Position'">
              <template #append>{{ formatMoney(c.amount) }}</template>
            </v-list-item>
          </v-list>
        </v-card>
        <v-alert v-else type="info" variant="tonal">
          Lade einen Beleg hoch und klicke „Mit KI analysieren“. Die Mock-KI extrahiert Positionen und legt
          automatisch Untertransaktionen an.
        </v-alert>
      </v-col>
    </v-row>
  </div>
</template>
