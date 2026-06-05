<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api, apiBaseUrl, getToken } from "@/api/client";
import { formatDate } from "@/utils/format";
import { importCommitColumnMappingSchema, type SuggestedImportColumnMapping } from "@naxeu/shared";

interface Account {
  id: string;
  name: string;
}
interface ImportRow {
  id: string;
  fileName: string | null;
  status: string;
  importedCount: number;
  skippedCount: number;
  createdAt: string;
}

interface AnalyzeResponse {
  format: string;
  fileName: string;
  accountId: string | null;
  headers: string[];
  previewRows: string[][];
  suggestedMapping: SuggestedImportColumnMapping;
  confidence: number;
  needsUserMapping: boolean;
  source: "heuristic" | "ai";
  delimiter: string;
  hasHeader: boolean;
}

const accounts = ref<Account[]>([]);
const accountId = ref<string | null>(null);
const file = ref<File | File[] | null>(null);
const analyzing = ref(false);
const committing = ref(false);
const result = ref<{ imported: number; skipped: number } | null>(null);
const error = ref("");
const imports = ref<ImportRow[]>([]);

const step = ref<"pick" | "mapping">("pick");
const analyzeResult = ref<AnalyzeResponse | null>(null);

/** Column index per role; merchant uses `-1` = none in UI. */
const mapDate = ref(0);
const mapAmount = ref(0);
const mapDescription = ref(0);
const mapMerchant = ref(-1);

function chosenFile(): File | null {
  const v = file.value;
  if (v == null) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  if (v instanceof File) return v;
  return null;
}

const columnItems = computed(() => {
  const h = analyzeResult.value?.headers ?? [];
  return h.map((title, value) => ({
    title: title.trim() || `Spalte ${value + 1}`,
    value,
  }));
});

const merchantItems = computed(() => [{ title: "— keine Händler-Spalte —", value: -1 }, ...columnItems.value]);

function applySuggestion(s: SuggestedImportColumnMapping, colCount: number): void {
  const safe = (i: number | null, fallback: number) =>
    i !== null && i >= 0 && i < colCount ? i : Math.min(fallback, Math.max(0, colCount - 1));
  mapDate.value = safe(s.date, 0);
  mapAmount.value = safe(s.amount, Math.min(1, colCount - 1));
  mapDescription.value = safe(s.description, Math.min(2, colCount - 1));
  if (s.merchant !== null && s.merchant >= 0 && s.merchant < colCount) {
    mapMerchant.value = s.merchant;
  } else {
    mapMerchant.value = -1;
  }
}

const sample =
  "date,amount,description,merchant\n2026-06-01,-19.99,Spotify,Spotify\n2026-06-02,-54.20,Wocheneinkauf,Rewe\n2026-06-03,1500,Bonus,Arbeitgeber";

async function load(): Promise<void> {
  const [a, i] = await Promise.all([
    api<{ accounts: Account[] }>("/accounts"),
    api<{ imports: ImportRow[] }>("/imports"),
  ]);
  accounts.value = a.accounts;
  imports.value = i.imports;
}

async function analyze(): Promise<void> {
  const f = chosenFile();
  if (!f) {
    error.value = "Bitte zuerst eine Datei auswählen.";
    return;
  }
  analyzing.value = true;
  error.value = "";
  result.value = null;
  analyzeResult.value = null;
  try {
    const fd = new FormData();
    if (accountId.value) fd.append("accountId", accountId.value);
    fd.append("file", f);
    const res = await fetch(`${apiBaseUrl()}/imports/analyze`, {
      method: "POST",
      headers: { authorization: `Bearer ${getToken()}` },
      body: fd,
    });
    const data = (await res.json()) as AnalyzeResponse & { message?: string };
    if (!res.ok) throw new Error(data.message ?? "Analyse fehlgeschlagen");
    analyzeResult.value = data;
    const n = data.headers.length;
    applySuggestion(data.suggestedMapping, n);
    step.value = "mapping";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Fehler";
    step.value = "pick";
  } finally {
    analyzing.value = false;
  }
}

async function commitImport(): Promise<void> {
  const f = chosenFile();
  if (!f) {
    error.value = "Datei fehlt — bitte erneut wählen.";
    return;
  }
  const mappingPayload = {
    date: mapDate.value,
    amount: mapAmount.value,
    description: mapDescription.value,
    merchant: mapMerchant.value < 0 ? null : mapMerchant.value,
  };
  const parsed = importCommitColumnMappingSchema.safeParse(mappingPayload);
  if (!parsed.success) {
    error.value = parsed.error.issues[0]?.message ?? "Spaltenzuordnung ungültig.";
    return;
  }

  committing.value = true;
  error.value = "";
  result.value = null;
  try {
    const fd = new FormData();
    if (accountId.value) fd.append("accountId", accountId.value);
    fd.append("file", f);
    fd.append("mapping", JSON.stringify(parsed.data));
    const res = await fetch(`${apiBaseUrl()}/imports/commit`, {
      method: "POST",
      headers: { authorization: `Bearer ${getToken()}` },
      body: fd,
    });
    const data = (await res.json()) as { imported?: number; skipped?: number; message?: string };
    if (!res.ok) throw new Error(data.message ?? "Import fehlgeschlagen");
    result.value = { imported: data.imported ?? 0, skipped: data.skipped ?? 0 };
    step.value = "pick";
    analyzeResult.value = null;
    file.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Fehler";
  } finally {
    committing.value = false;
  }
}

function resetFlow(): void {
  step.value = "pick";
  analyzeResult.value = null;
  error.value = "";
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
    <h1 class="text-h4 font-weight-bold mb-4">Import</h1>
    <v-row>
      <v-col cols="12" lg="7">
        <v-card rounded="lg" border>
          <v-card-title>{{ step === "pick" ? "Datei analysieren" : "Spalten zuordnen" }}</v-card-title>
          <v-card-text>
            <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>

            <template v-if="step === 'pick'">
              <p class="text-medium-emphasis mb-3">
                Unterstützt: CSV, TSV (Tab), Excel (<code>.xlsx</code> / <code>.xls</code>). Nach der Analyse
                erkennt das System Spalten per Heuristik und optional per KI — bei Unsicherheit ordnest du sie
                manuell zu.
              </p>
              <v-select
                v-model="accountId"
                :items="accounts"
                item-title="name"
                item-value="id"
                label="Konto (optional)"
                variant="outlined"
                clearable
              />
              <v-file-input
                v-model="file"
                label="Datei"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                variant="outlined"
                prepend-icon="mdi-file-upload"
                show-size
                class="mb-2"
              />
              <div class="d-flex ga-2 flex-wrap">
                <v-btn
                  color="primary"
                  :loading="analyzing"
                  :disabled="!chosenFile()"
                  prepend-icon="mdi-magnify"
                  @click="analyze"
                >
                  Analysieren
                </v-btn>
                <v-btn variant="text" prepend-icon="mdi-download" @click="downloadSample">Beispiel-CSV</v-btn>
              </div>
            </template>

            <template v-else>
              <v-alert
                v-if="analyzeResult?.needsUserMapping"
                type="warning"
                variant="tonal"
                density="compact"
                class="mb-3"
              >
                Zuordnung ist unsicher — bitte prüfe die Spaltenauswahl (Konfidenz
                {{ (analyzeResult.confidence * 100).toFixed(0) }} %, Quelle: {{ analyzeResult.source }}).
              </v-alert>
              <v-alert v-else type="info" variant="tonal" density="compact" class="mb-3">
                Vorschlag übernommen ({{ (analyzeResult!.confidence * 100).toFixed(0) }} %, Quelle:
                {{ analyzeResult!.source }}). Du kannst die Zuordnung anpassen.
              </v-alert>

              <p class="text-body-2 mb-2">
                Datei: <strong>{{ analyzeResult?.fileName }}</strong> · Format: {{ analyzeResult?.format }} ·
                Trennzeichen: <code>{{ analyzeResult?.delimiter }}</code>
              </p>

              <v-row dense class="mb-4">
                <v-col cols="12" sm="6">
                  <v-select
                    v-model="mapDate"
                    :items="columnItems"
                    label="Datum"
                    variant="outlined"
                    hide-details="auto"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-select
                    v-model="mapAmount"
                    :items="columnItems"
                    label="Betrag"
                    variant="outlined"
                    hide-details="auto"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-select
                    v-model="mapDescription"
                    :items="columnItems"
                    label="Beschreibung / Verwendungszweck"
                    variant="outlined"
                    hide-details="auto"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-select
                    v-model="mapMerchant"
                    :items="merchantItems"
                    label="Händler / Gegenpartei (optional)"
                    variant="outlined"
                    hide-details="auto"
                  />
                </v-col>
              </v-row>

              <div class="text-subtitle-2 mb-2">Vorschau (erste Zeilen)</div>
              <div class="overflow-x-auto mb-4 nx-import-preview">
                <table class="nx-import-table">
                  <thead>
                    <tr>
                      <th v-for="(h, i) in analyzeResult?.headers ?? []" :key="i">{{ h || `Spalte ${i + 1}` }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, ri) in analyzeResult?.previewRows ?? []" :key="ri">
                      <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="d-flex ga-2 flex-wrap">
                <v-btn color="primary" :loading="committing" prepend-icon="mdi-upload" @click="commitImport">
                  Import starten
                </v-btn>
                <v-btn variant="text" @click="resetFlow">Zurück</v-btn>
              </div>
            </template>

            <v-alert v-if="result" type="success" variant="tonal" class="mt-3">
              {{ result.imported }} importiert, {{ result.skipped }} übersprungen (leer / ungültig / Duplikate).
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" lg="5">
        <v-card rounded="lg" border>
          <v-card-title>Import-Verlauf</v-card-title>
          <v-list density="compact">
            <v-list-item
              v-for="imp in imports"
              :key="imp.id"
              :title="imp.fileName ?? 'Import'"
              :subtitle="`${formatDate(imp.createdAt)} · ${imp.status}`"
            >
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

<style scoped>
.nx-import-preview {
  max-height: 280px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
}
.nx-import-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.nx-import-table th,
.nx-import-table td {
  padding: 6px 10px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  text-align: left;
  white-space: nowrap;
}
.nx-import-table th {
  background: rgb(var(--v-theme-surface-variant));
  font-weight: 600;
}
</style>
