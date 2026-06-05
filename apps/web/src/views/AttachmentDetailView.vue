<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "@/api/client";
import { useRealtimeStore } from "@/stores/realtime";
import { formatMoney, formatDate } from "@/utils/format";
import { TransactionStatus, extractedAttachmentSchema } from "@naxeu/shared";
import AttachmentThumbnail from "@/components/AttachmentThumbnail.vue";

type TxStatusValue = (typeof TransactionStatus.values)[number];

interface Attachment {
  id: string;
  fileName: string;
  status: string;
  mimeType: string;
  extractedData: Record<string, unknown>;
  extractedText: string | null;
  transactionId: string | null;
  createdAt: string;
}

interface ExtractedFormLine {
  description: string;
  amount: string;
  categoryHint: string;
}

interface ExtractedFormState {
  merchantName: string;
  date: string;
  total: string;
  currency: string;
  confidence: string;
  lineItems: ExtractedFormLine[];
}

interface ChildTransaction {
  id: string;
  type: string;
  status: string;
  date: string;
  bookingDate: string | null;
  valueDate: string | null;
  amount: string;
  currency: string;
  merchantName: string | null;
  description: string | null;
  notes: string | null;
  categoryId: string | null;
  parentId: string | null;
  accountId: string | null;
  counterAccountId: string | null;
  affectsBudget: boolean;
  affectsAccountBalance: boolean;
  source: string;
  externalId: string | null;
}

interface TreeNode {
  node: ChildTransaction;
  children: TreeNode[];
}

interface Category {
  id: string;
  name: string;
}

interface ChildEditForm {
  date: string;
  amountPos: string;
  currency: string;
  merchantName: string;
  description: string;
  notes: string;
  categoryId: string | null;
  status: TxStatusValue;
  affectsBudget: boolean;
}

interface ChildRow {
  tx: ChildTransaction;
  form: ChildEditForm;
}

const route = useRoute();
const router = useRouter();
const realtime = useRealtimeStore();

const id = computed(() => String(route.params.id));

const error = ref("");
const loading = ref(true);
const analyzing = ref(false);
const attachment = ref<Attachment | null>(null);
const childRows = ref<ChildRow[]>([]);
const parentId = ref<string | null>(null);
const categories = ref<Category[]>([]);
const extractionSource = ref<"model" | "heuristic" | null>(null);
const savingChildId = ref<string | null>(null);
const savingAll = ref(false);
const deleteReceiptOpen = ref(false);
const deleteReceiptLoading = ref(false);
const deleteChildTarget = ref<ChildRow | null>(null);
const deleteChildLoading = ref(false);
const savingExtracted = ref(false);

const extractedForm = ref<ExtractedFormState | null>(null);

const txStatuses = [...TransactionStatus.values];

const deleteChildDialogOpen = computed({
  get: () => deleteChildTarget.value != null,
  set: (v: boolean) => {
    if (!v) deleteChildTarget.value = null;
  },
});

function fillExtractedForm(): void {
  const raw = attachment.value?.extractedData;
  if (!raw || typeof raw !== "object") {
    extractedForm.value = null;
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.lineItems)) {
    extractedForm.value = null;
    return;
  }
  const parsed = extractedAttachmentSchema.safeParse(raw);
  if (!parsed.success) {
    extractedForm.value = null;
    return;
  }
  const d = parsed.data;
  extractedForm.value = {
    merchantName: d.merchantName ?? "",
    date: d.date ?? "",
    total: d.total ?? "",
    currency: d.currency,
    confidence: String(d.confidence),
    lineItems: d.lineItems.map((li) => ({
      description: li.description,
      amount: li.amount,
      categoryHint: li.categoryHint ?? "",
    })),
  };
}

const inferredExtraction = computed((): "model" | "heuristic" | null => {
  const t = attachment.value?.extractedText ?? "";
  if (t.includes("KI-Extraktion")) return "model";
  if (t.includes("Heuristik")) return "heuristic";
  return null;
});

function isoDateSlice(d: string | Date): string {
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

function positiveAmountString(amount: string): string {
  const raw = Number.parseFloat(String(amount).replace(",", "."));
  if (!Number.isFinite(raw)) return "0.00";
  return Math.abs(raw).toFixed(2);
}

function buildForm(tx: ChildTransaction): ChildEditForm {
  return {
    date: isoDateSlice(tx.date),
    amountPos: positiveAmountString(tx.amount),
    currency: tx.currency ?? "EUR",
    merchantName: tx.merchantName ?? "",
    description: tx.description ?? "",
    notes: tx.notes ?? "",
    categoryId: tx.categoryId,
    status: (tx.status as TxStatusValue) ?? "confirmed",
    affectsBudget: tx.affectsBudget,
  };
}

function setChildrenFromTree(tree: TreeNode | null): void {
  if (!tree?.children?.length) {
    childRows.value = [];
    parentId.value = null;
    return;
  }
  parentId.value = tree.node.id;
  const rows = tree.children.map((c) => c.node);
  childRows.value = rows.map((tx) => ({ tx, form: buildForm(tx) }));
}

async function loadCategories(): Promise<void> {
  try {
    const res = await api<{ categories: Category[] }>("/categories");
    categories.value = res.categories;
  } catch {
    categories.value = [];
  }
}

async function loadDetail(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const res = await api<{ attachment: Attachment; transactionTree: TreeNode | null }>(
      `/attachments/${id.value}`,
    );
    attachment.value = res.attachment;
    extractionSource.value = null;
    setChildrenFromTree(res.transactionTree);
    const inf = inferredExtraction.value;
    if (inf) extractionSource.value = inf;
    fillExtractedForm();
    await loadCategories();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Laden fehlgeschlagen";
    attachment.value = null;
    childRows.value = [];
    extractedForm.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => void loadDetail());
watch(id, () => void loadDetail());

watch(
  () => realtime.lastEvent,
  (ev) => {
    if (ev?.entityType !== "attachment" || ev.entityId !== id.value) return;
    if (ev.meta?.deleted === true) {
      void router.push({ name: "attachments" });
      return;
    }
    void loadDetail();
  },
);

const moneyOk = (s: string): boolean => /^-?\d+(\.\d{1,2})?$/u.test(s.trim().replace(",", "."));

/** Vergleicht Summe (extrahiert) mit der Summe der Positionsbeträge (Formular, positiv). */
const sumMismatchWarning = computed((): string | null => {
  const form = extractedForm.value;
  if (!form || childRows.value.length === 0) return null;
  const extStr = form.total.trim().replace(",", ".");
  if (extStr === "") return null;
  if (!moneyOk(extStr)) return null;
  const extTotal = Math.abs(Number.parseFloat(extStr));
  if (!Number.isFinite(extTotal)) return null;

  let sum = 0;
  for (const row of childRows.value) {
    const p = row.form.amountPos.trim().replace(",", ".");
    if (!moneyOk(p)) return null;
    sum += Math.abs(Number.parseFloat(p));
  }
  if (!Number.isFinite(sum)) return null;

  const tol = 0.02;
  if (Math.abs(sum - extTotal) <= tol) return null;

  const cur = form.currency.trim().toUpperCase().slice(0, 3) || "EUR";
  return `Die Summe der Positionen (${formatMoney(sum)}) stimmt nicht mit der extrahierten Belegsumme (${formatMoney(extTotal)}) überein (Währung laut Beleg: ${cur}). Bitte Beträge oder die extrahierte Summe prüfen.`;
});

async function saveChildRow(row: ChildRow): Promise<boolean> {
  const { tx, form } = row;
  const amt = form.amountPos.trim().replace(",", ".");
  if (!moneyOk(amt)) {
    error.value = "Ungültiger Betrag (max. 2 Nachkommastellen).";
    return false;
  }
  error.value = "";
  savingChildId.value = tx.id;
  try {
    const res = await api<{ transaction: ChildTransaction }>(`/transactions/${tx.id}`, {
      method: "PUT",
      body: {
        type: "item",
        status: form.status,
        date: form.date,
        amount: amt,
        currency: form.currency.trim().toUpperCase().slice(0, 3) || "EUR",
        merchantName: form.merchantName.trim() || null,
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        categoryId: form.categoryId,
        affectsBudget: form.affectsBudget,
        affectsAccountBalance: tx.affectsAccountBalance,
      },
    });
    row.tx = res.transaction;
    row.form = buildForm(res.transaction);
    return true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Speichern fehlgeschlagen";
    return false;
  } finally {
    savingChildId.value = null;
  }
}

async function saveAllChildren(): Promise<void> {
  if (!childRows.value.length) return;
  savingAll.value = true;
  error.value = "";
  try {
    for (const row of childRows.value) {
      const ok = await saveChildRow(row);
      if (!ok) break;
    }
  } finally {
    savingAll.value = false;
  }
}

async function retryAnalyze(): Promise<void> {
  analyzing.value = true;
  error.value = "";
  try {
    await api(`/attachments/${id.value}/analyze`, { method: "POST" });
    await loadDetail();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Analyse fehlgeschlagen";
  } finally {
    analyzing.value = false;
  }
}

function openParent(): void {
  if (parentId.value) void router.push(`/transactions/${parentId.value}`);
}

async function saveExtractedData(): Promise<void> {
  if (!extractedForm.value) return;
  savingExtracted.value = true;
  error.value = "";
  try {
    const f = extractedForm.value;
    const totalSt = f.total.trim().replace(",", ".");
    const totalSubmit = totalSt === "" ? null : totalSt;
    if (totalSubmit !== null && !moneyOk(totalSubmit)) {
      error.value = "Summe: ungültiger Betrag (max. 2 Nachkommastellen).";
      return;
    }
    for (let i = 0; i < f.lineItems.length; i++) {
      const amt = f.lineItems[i].amount.trim().replace(",", ".");
      if (!moneyOk(amt)) {
        error.value = `Position ${i + 1} (KI-Zeile): ungültiger Betrag.`;
        return;
      }
    }
    const conf = Number.parseFloat(f.confidence.replace(",", "."));
    if (!Number.isFinite(conf)) {
      error.value = "Konfidenz muss eine Zahl sein (0–1).";
      return;
    }
    const payload = {
      merchantName: f.merchantName.trim() || null,
      date: f.date.trim() || null,
      total: totalSubmit,
      currency: f.currency.trim().toUpperCase().replace(/[^A-Z]/gu, "").slice(0, 3) || "EUR",
      confidence: Math.min(1, Math.max(0, conf)),
      lineItems: f.lineItems.map((li) => ({
        description: li.description,
        amount: li.amount.trim().replace(",", "."),
        categoryHint: li.categoryHint.trim() || null,
      })),
    };
    const parsed = extractedAttachmentSchema.safeParse(payload);
    if (!parsed.success) {
      error.value = parsed.error.issues.map((i) => i.message).join("; ");
      return;
    }
    const res = await api<{ attachment: Attachment }>(`/attachments/${id.value}`, {
      method: "PATCH",
      body: { extractedData: parsed.data },
    });
    attachment.value = res.attachment;
    fillExtractedForm();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Belegdaten konnten nicht gespeichert werden";
  } finally {
    savingExtracted.value = false;
  }
}

function openDeleteChildDialog(row: ChildRow): void {
  deleteChildTarget.value = row;
}

async function confirmDeleteChild(): Promise<void> {
  const row = deleteChildTarget.value;
  if (!row) return;
  deleteChildLoading.value = true;
  error.value = "";
  try {
    await api(`/transactions/${row.tx.id}`, { method: "DELETE" });
    deleteChildTarget.value = null;
    await loadDetail();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Position konnte nicht gelöscht werden";
  } finally {
    deleteChildLoading.value = false;
  }
}

async function confirmDeleteReceipt(): Promise<void> {
  deleteReceiptLoading.value = true;
  error.value = "";
  try {
    await api(`/attachments/${id.value}`, { method: "DELETE" });
    deleteReceiptOpen.value = false;
    await router.push({ name: "attachments" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Beleg konnte nicht gelöscht werden";
  } finally {
    deleteReceiptLoading.value = false;
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center flex-wrap ga-2 mb-4">
      <v-btn variant="text" prepend-icon="mdi-arrow-left" :to="{ name: 'attachments' }">Zur Übersicht</v-btn>
      <v-spacer />
      <v-btn
        v-if="attachment?.status === 'failed'"
        color="primary"
        :loading="analyzing"
        prepend-icon="mdi-refresh"
        @click="retryAnalyze"
      >
        Analyse erneut starten
      </v-btn>
      <v-btn
        v-if="attachment"
        color="error"
        variant="tonal"
        prepend-icon="mdi-delete-outline"
        :disabled="analyzing || deleteReceiptLoading"
        @click="deleteReceiptOpen = true"
      >
        Beleg löschen
      </v-btn>
    </div>

    <v-progress-linear v-if="loading" indeterminate class="mb-4" />
    <v-alert v-else-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>

    <template v-if="!loading && attachment">
      <h1 class="text-h4 font-weight-bold mb-1">Beleg</h1>
      <p class="text-body-2 text-medium-emphasis mb-4">Hochgeladen am {{ formatDate(attachment.createdAt) }}</p>
      <div class="d-flex flex-wrap align-center ga-2 mb-4">
        <v-chip size="small" :color="attachment.status === 'processed' ? 'success' : attachment.status === 'failed' ? 'error' : 'info'">
          {{ attachment.status }}
        </v-chip>
        <span class="text-body-2 text-medium-emphasis">{{ attachment.mimeType }}</span>
      </div>

      <v-alert v-if="attachment.status === 'processing' || attachment.status === 'uploaded'" type="info" variant="tonal" class="mb-4">
        <strong>Analyse läuft</strong> — der Beleg wird im Hintergrund verarbeitet. Diese Seite aktualisiert sich automatisch.
      </v-alert>

      <v-row>
        <v-col cols="12" md="4">
          <v-card rounded="lg" border>
            <AttachmentThumbnail
              :attachment-id="attachment.id"
              :mime-type="attachment.mimeType"
              variant="detail"
            />
            <v-card-text v-if="attachment.extractedText" class="text-caption">{{ attachment.extractedText }}</v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="8">
          <v-alert
            v-if="extractionSource === 'heuristic'"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-3"
          >
            Es wurde die <strong>lokale Heuristik</strong> oder ein Fallback verwendet (z. B. wenn die KI-Anfrage fehlschlägt — API-Key, Modell oder Logs im Worker prüfen). Für KI in
            <code>config/ai.yml</code> z. B. <code>AI_ENABLED=true</code> / <code>AI_DEFAULT_PROVIDER</code> /
            <code>AI_TASK_ATTACHMENT_EXTRACTION_*</code> per <code>${…}</code> aus der Umgebung befüllen;
            <code>attachmentExtraction</code> darf nicht auf <code>mock</code> stehen. Bilder nutzen Vision, wenn Bytes erkannt werden und das Modell Multimodal unterstützt.
          </v-alert>
          <v-alert
            v-else-if="extractionSource === 'model'"
            type="success"
            variant="tonal"
            density="compact"
            class="mb-3"
          >
            Extraktion vom <strong>Sprachmodell</strong> (bei Fotos inkl. Bildanalyse).
          </v-alert>

          <v-card v-if="extractedForm" rounded="lg" border class="mb-4">
            <v-card-title class="d-flex align-center flex-wrap ga-2">
              <span>Geparste Belegdaten</span>
              <v-spacer />
              <v-btn v-if="parentId" size="small" variant="tonal" prepend-icon="mdi-file-tree" @click="openParent">Elterntransaktion</v-btn>
              <v-btn
                color="primary"
                size="small"
                variant="flat"
                :loading="savingExtracted"
                prepend-icon="mdi-content-save"
                @click="void saveExtractedData()"
              >
                Speichern
              </v-btn>
            </v-card-title>
            <v-card-text>
              <v-row dense>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="extractedForm.merchantName"
                    label="Händler / Lieferant"
                    variant="outlined"
                    density="compact"
                    hide-details
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field v-model="extractedForm.date" label="Belegdatum" type="date" variant="outlined" density="compact" hide-details />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="extractedForm.total"
                    label="Summe (extrahiert)"
                    variant="outlined"
                    density="compact"
                    hide-details
                    hint="Leer lassen, wenn unbekannt"
                    persistent-hint
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field v-model="extractedForm.currency" label="Währung" maxlength="3" variant="outlined" density="compact" hide-details />
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <v-alert v-if="sumMismatchWarning" type="warning" variant="tonal" density="comfortable" class="mb-4">
            {{ sumMismatchWarning }}
          </v-alert>

          <v-card v-if="childRows.length" rounded="lg" border>
            <v-card-title class="d-flex align-center flex-wrap ga-2">
              <span>Positionen</span>
              <v-spacer />
              <v-btn v-if="parentId && !extractedForm" size="small" variant="tonal" prepend-icon="mdi-file-tree" @click="openParent">
                Elterntransaktion
              </v-btn>
              <v-btn
                color="primary"
                variant="tonal"
                size="small"
                :loading="savingAll"
                :disabled="!!savingChildId"
                prepend-icon="mdi-content-save-all"
                @click="saveAllChildren"
              >
                Alle speichern
              </v-btn>
            </v-card-title>
            <v-card-text class="text-body-2 text-medium-emphasis pb-2">
              Erzeugte Untertransaktionen mit den zugehörigen KI-Rohzeilen (falls vorhanden) — eine gemeinsame Liste pro
              Position.
            </v-card-text>
            <v-card-text class="pt-0">
              <v-expansion-panels multiple variant="accordion">
                <v-expansion-panel v-for="(row, index) in childRows" :key="row.tx.id">
                  <v-expansion-panel-title class="text-body-2">
                    <span class="font-weight-medium">Position {{ index + 1 }}</span>
                    <span class="mx-2 text-medium-emphasis">·</span>
                    <span>{{ row.form.description.trim() || row.form.merchantName.trim() || "Ohne Text" }}</span>
                    <v-spacer />
                    <span class="text-no-wrap me-2">{{ formatMoney(row.tx.amount) }} {{ row.tx.currency }}</span>
                  </v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <v-sheet v-if="extractedForm && extractedForm.lineItems[index]" border rounded class="pa-3 mb-4 text-body-2">
                      <div class="text-caption text-medium-emphasis mb-2">KI-Rohdaten (bearbeitbar)</div>
                      <v-row dense>
                        <v-col cols="12">
                          <v-text-field
                            v-model="extractedForm.lineItems[index].description"
                            label="Beschreibung"
                            variant="outlined"
                            density="compact"
                            hide-details
                          />
                        </v-col>
                        <v-col cols="12" sm="6">
                          <v-text-field
                            v-model="extractedForm.lineItems[index].amount"
                            label="Betrag"
                            variant="outlined"
                            density="compact"
                            hide-details
                          />
                        </v-col>
                        <v-col cols="12" sm="6">
                          <v-text-field
                            v-model="extractedForm.lineItems[index].categoryHint"
                            label="Kategorie-Hinweis"
                            variant="outlined"
                            density="compact"
                            hide-details
                          />
                        </v-col>
                      </v-row>
                      <p class="text-caption text-medium-emphasis mt-2 mb-0">
                        Änderungen hier speichern mit „Speichern“ unter „Geparste Belegdaten“.
                      </p>
                    </v-sheet>

                    <v-row dense>
                      <v-col cols="12" sm="6">
                        <v-text-field v-model="row.form.date" label="Buchungsdatum" type="date" variant="outlined" density="compact" hide-details />
                      </v-col>
                      <v-col cols="12" sm="3">
                        <v-text-field
                          v-model="row.form.amountPos"
                          label="Betrag (positiv)"
                          variant="outlined"
                          density="compact"
                          hide-details
                          hint="Wird als Budget-Position (negativ) gespeichert"
                          persistent-hint
                        />
                      </v-col>
                      <v-col cols="12" sm="3">
                        <v-text-field v-model="row.form.currency" label="Währung" maxlength="3" variant="outlined" density="compact" hide-details />
                      </v-col>
                      <v-col cols="12" sm="6">
                        <v-text-field v-model="row.form.merchantName" label="Händler / Kurztext" variant="outlined" density="compact" hide-details />
                      </v-col>
                      <v-col cols="12" sm="6">
                        <v-select
                          v-model="row.form.categoryId"
                          :items="categories"
                          item-title="name"
                          item-value="id"
                          label="Kategorie"
                          clearable
                          variant="outlined"
                          density="compact"
                          hide-details
                        />
                      </v-col>
                      <v-col cols="12">
                        <v-textarea v-model="row.form.description" label="Beschreibung" rows="2" variant="outlined" density="compact" hide-details />
                      </v-col>
                      <v-col cols="12">
                        <v-textarea v-model="row.form.notes" label="Notizen" rows="2" variant="outlined" density="compact" hide-details />
                      </v-col>
                      <v-col cols="12" sm="6">
                        <v-select
                          v-model="row.form.status"
                          :items="txStatuses"
                          label="Status"
                          variant="outlined"
                          density="compact"
                          hide-details
                        />
                      </v-col>
                      <v-col cols="12" sm="6" class="d-flex align-center">
                        <v-switch v-model="row.form.affectsBudget" label="Wirkt auf Budget" color="primary" density="compact" hide-details />
                      </v-col>
                    </v-row>

                    <v-divider class="my-3" />
                    <div class="text-caption text-medium-emphasis mb-2">Technische Felder (nur Anzeige)</div>
                    <v-table density="compact" class="bg-transparent text-body-2">
                      <tbody>
                        <tr>
                          <td class="text-medium-emphasis" style="width: 36%">ID</td>
                          <td class="font-monospace">{{ row.tx.id }}</td>
                        </tr>
                        <tr>
                          <td class="text-medium-emphasis">Typ</td>
                          <td>{{ row.tx.type }}</td>
                        </tr>
                        <tr>
                          <td class="text-medium-emphasis">Quelle</td>
                          <td>{{ row.tx.source }}</td>
                        </tr>
                        <tr>
                          <td class="text-medium-emphasis">Eltern-ID</td>
                          <td class="font-monospace">{{ row.tx.parentId ?? "–" }}</td>
                        </tr>
                        <tr>
                          <td class="text-medium-emphasis">Konto / Gegenkonto</td>
                          <td>{{ row.tx.accountId ?? "–" }} / {{ row.tx.counterAccountId ?? "–" }}</td>
                        </tr>
                        <tr>
                          <td class="text-medium-emphasis">Gebucht / Wertstellung</td>
                          <td>{{ row.tx.bookingDate ?? "–" }} / {{ row.tx.valueDate ?? "–" }}</td>
                        </tr>
                        <tr>
                          <td class="text-medium-emphasis">Externe ID</td>
                          <td>{{ row.tx.externalId ?? "–" }}</td>
                        </tr>
                        <tr>
                          <td class="text-medium-emphasis">Betrag (gespeichert)</td>
                          <td>{{ row.tx.amount }} {{ row.tx.currency }}</td>
                        </tr>
                        <tr>
                          <td class="text-medium-emphasis">Kontostand-relevant</td>
                          <td>{{ row.tx.affectsAccountBalance ? "Ja" : "Nein" }}</td>
                        </tr>
                      </tbody>
                    </v-table>

                    <div class="d-flex flex-wrap justify-end ga-2 mt-3">
                      <v-btn
                        color="error"
                        variant="text"
                        prepend-icon="mdi-delete-outline"
                        :disabled="savingAll || savingChildId === row.tx.id"
                        @click="openDeleteChildDialog(row)"
                      >
                        Position löschen
                      </v-btn>
                      <v-btn
                        color="primary"
                        :loading="savingChildId === row.tx.id"
                        :disabled="savingAll"
                        prepend-icon="mdi-content-save"
                        @click="void saveChildRow(row)"
                      >
                        Speichern
                      </v-btn>
                    </div>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </v-card-text>
          </v-card>
          <v-alert v-else-if="attachment.status === 'processed'" type="warning" variant="tonal">
            Keine Untertransaktionen gefunden (unerwartet nach verarbeitetem Status).
          </v-alert>
        </v-col>
      </v-row>

      <v-dialog v-model="deleteReceiptOpen" max-width="440" content-class="nx-dialog-panel">
        <v-card variant="elevated" color="surface" rounded="lg" elevation="8">
          <v-card-title>Beleg löschen?</v-card-title>
          <v-card-text class="text-body-2">
            Dieser Beleg und alle zugehörigen Transaktionen werden unwiderruflich entfernt.
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" :disabled="deleteReceiptLoading" @click="deleteReceiptOpen = false">Abbrechen</v-btn>
            <v-btn color="error" variant="flat" :loading="deleteReceiptLoading" @click="void confirmDeleteReceipt()">
              Löschen
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <v-dialog v-model="deleteChildDialogOpen" max-width="420" content-class="nx-dialog-panel">
        <v-card v-if="deleteChildTarget" variant="elevated" color="surface" rounded="lg" elevation="8">
          <v-card-title>Position löschen?</v-card-title>
          <v-card-text class="text-body-2">
            Diese Untertransaktion wird entfernt. Der Beleg und die übrigen Positionen bleiben erhalten.
            <div v-if="deleteChildTarget.form.description.trim()" class="mt-2 text-medium-emphasis">
              „{{ deleteChildTarget.form.description.trim() }}“
            </div>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" :disabled="deleteChildLoading" @click="deleteChildTarget = null">Abbrechen</v-btn>
            <v-btn color="error" variant="flat" :loading="deleteChildLoading" @click="void confirmDeleteChild()">
              Löschen
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>
  </div>
</template>
