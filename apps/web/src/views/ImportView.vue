<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, apiBaseUrl, getToken } from "@/api/client";
import { formatDate } from "@/utils/format";

interface Account { id: string; name: string }
interface ImportRow { id: string; fileName: string | null; status: string; importedCount: number; skippedCount: number; createdAt: string }

const accounts = ref<Account[]>([]);
const accountId = ref<string | null>(null);
const file = ref<File[]>([]);
const uploading = ref(false);
const result = ref<{ imported: number; skipped: number } | null>(null);
const error = ref("");
const imports = ref<ImportRow[]>([]);

const sample = "date,amount,description,merchant\n2026-06-01,-19.99,Spotify,Spotify\n2026-06-02,-54.20,Wocheneinkauf,Rewe\n2026-06-03,1500,Bonus,Arbeitgeber";

async function load(): Promise<void> {
  const [a, i] = await Promise.all([
    api<{ accounts: Account[] }>("/accounts"),
    api<{ imports: ImportRow[] }>("/imports"),
  ]);
  accounts.value = a.accounts;
  imports.value = i.imports;
}

async function upload(): Promise<void> {
  if (!file.value[0]) return;
  uploading.value = true;
  error.value = "";
  result.value = null;
  try {
    const fd = new FormData();
    if (accountId.value) fd.append("accountId", accountId.value);
    fd.append("file", file.value[0]);
    const res = await fetch(`${apiBaseUrl()}/imports/csv`, {
      method: "POST",
      headers: { authorization: `Bearer ${getToken()}` },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Upload fehlgeschlagen");
    result.value = { imported: data.imported, skipped: data.skipped };
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Fehler";
  } finally {
    uploading.value = false;
  }
}

function downloadSample(): void {
  const blob = new Blob([sample], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "naxeu-sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

onMounted(load);
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-4">CSV-Import</h1>
    <v-row>
      <v-col cols="12" md="6">
        <v-card rounded="lg" border>
          <v-card-title>Datei hochladen</v-card-title>
          <v-card-text>
            <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>
            <p class="text-medium-emphasis mb-3">Spalten: <code>date, amount, description, merchant</code></p>
            <v-select v-model="accountId" :items="accounts" item-title="name" item-value="id" label="Konto (optional)" variant="outlined" clearable />
            <v-file-input v-model="file" label="CSV-Datei" accept=".csv" variant="outlined" prepend-icon="mdi-file-delimited" />
            <div class="d-flex ga-2">
              <v-btn color="primary" :loading="uploading" prepend-icon="mdi-upload" @click="upload">Importieren</v-btn>
              <v-btn variant="text" prepend-icon="mdi-download" @click="downloadSample">Beispiel-CSV</v-btn>
            </div>
            <v-alert v-if="result" type="success" variant="tonal" class="mt-3">
              {{ result.imported }} importiert, {{ result.skipped }} übersprungen (Duplikate).
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card rounded="lg" border>
          <v-card-title>Import-Verlauf</v-card-title>
          <v-list density="compact">
            <v-list-item v-for="imp in imports" :key="imp.id" :title="imp.fileName ?? 'Import'" :subtitle="`${formatDate(imp.createdAt)} · ${imp.status}`">
              <template #append>
                <v-chip size="small" color="success">+{{ imp.importedCount }}</v-chip>
                <v-chip v-if="imp.skippedCount" size="small" class="ml-1">~{{ imp.skippedCount }}</v-chip>
              </template>
            </v-list-item>
            <v-list-item v-if="imports.length === 0" title="Noch keine Importe" />
          </v-list>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
