<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRealtimeStore } from "@/stores/realtime";
import { api } from "@/api/client";
import { formatMoney, formatDate } from "@/utils/format";
import { TransactionStatus, extractedAttachmentSchema } from "@naxeu/shared";

type TxStatusValue = (typeof TransactionStatus.values)[number];

const props = defineProps<{ attachmentId: string }>();
const emit = defineEmits<{ updated: [] }>();

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

const realtime = useRealtimeStore();

const error = ref("");
const loading = ref(true);
const attachment = ref<Attachment | null>(null);
const childRows = ref<ChildRow[]>([]);
const parentId = ref<string | null>(null);
const categories = ref<Category[]>([]);
const extractionSource = ref<"model" | "heuristic" | null>(null);
const savingChildId = ref<string | null>(null);
const savingAll = ref(false);
const deleteChildTarget = ref<ChildRow | null>(null);
const deleteChildLoading = ref(false);

const txStatuses = [...TransactionStatus.values];

const deleteChildDialogOpen = computed({
  get: () => deleteChildTarget.value != null,
  set: (v: boolean) => {
    if (!v) deleteChildTarget.value = null;
  },
});

const inferredExtraction = computed((): "model" | "heuristic" | null => {
  const t = attachment.value?.extractedText ?? "";
  if (t.includes("KI-Extraktion")) return "model";
  if (t.includes("Heuristik")) return "heuristic";
  return null;
});

const parsedExtractedReadonly = computed(() => {
  const raw = attachment.value?.extractedData;
  if (!raw || typeof raw !== "object") return null;
  const parsed = extractedAttachmentSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
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
      `/attachments/${props.attachmentId}`,
    );
    attachment.value = res.attachment;
    extractionSource.value = null;
    setChildrenFromTree(res.transactionTree);
    const inf = inferredExtraction.value;
    if (inf) extractionSource.value = inf;
    await loadCategories();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Laden fehlgeschlagen";
    attachment.value = null;
    childRows.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => void loadDetail());
watch(
  () => props.attachmentId,
  () => void loadDetail(),
);

watch(
  () => realtime.lastEvent,
  (ev) => {
    if (ev?.entityType !== "attachment" || ev.entityId !== props.attachmentId) return;
    void loadDetail();
    emit("updated");
  },
);

const moneyOk = (s: string): boolean => /^-?\d+(\.\d{1,2})?$/u.test(s.trim().replace(",", "."));

const sumMismatchWarning = computed((): string | null => {
  const ext = parsedExtractedReadonly.value;
  if (!ext || childRows.value.length === 0) return null;
  const totalRaw = ext.total;
  if (totalRaw == null || totalRaw === "") return null;
  const extStr = String(totalRaw).trim().replace(",", ".");
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

  const cur = String(ext.currency ?? "EUR")
    .trim()
    .toUpperCase()
    .slice(0, 3) || "EUR";
  return `Die Summe der Positionen (${formatMoney(sum)}) weicht von der erkannten Belegsumme (${formatMoney(extTotal)}, ${cur}) ab. Bitte die Positionsbeträge prüfen.`;
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
    emit("updated");
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
    emit("updated");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Position konnte nicht gelöscht werden";
  } finally {
    deleteChildLoading.value = false;
  }
}
</script>

<template>
  <div>
    <v-progress-linear v-if="loading" indeterminate class="mb-4" />
    <v-alert v-else-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>

    <template v-if="!loading && attachment">
      <p class="text-body-2 text-medium-emphasis mb-2">
        Belegdatei: {{ attachment.fileName }} · hochgeladen {{ formatDate(attachment.createdAt) }}
      </p>

      <v-alert
        v-if="extractionSource === 'heuristic'"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-3"
      >
        Es wurde die <strong>lokale Heuristik</strong> oder ein Fallback verwendet.
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

      <v-alert v-if="sumMismatchWarning" type="warning" variant="tonal" density="comfortable" class="mb-4">
        {{ sumMismatchWarning }}
      </v-alert>

      <v-card v-if="childRows.length" rounded="lg" border>
        <v-card-title class="d-flex align-center flex-wrap ga-2">
          <span>Untertransaktionen (Belegpositionen)</span>
          <v-spacer />
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
          Jede Zeile entspricht einer Budget-Position aus dem Beleg — hier bearbeiten und speichern.
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
                <details class="nx-receipt-tech-details">
                  <summary class="nx-receipt-tech-summary text-caption text-medium-emphasis d-flex align-center">
                    <v-icon size="small" class="nx-receipt-tech-chevron me-1 flex-shrink-0" icon="mdi-chevron-right" />
                    Technische Felder
                  </summary>
                  <v-table density="compact" class="bg-transparent text-body-2 mt-2">
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
                </details>

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
    </template>

    <v-dialog v-model="deleteChildDialogOpen" max-width="420" content-class="nx-dialog-panel">
      <v-card v-if="deleteChildTarget" variant="elevated" color="surface" rounded="lg" elevation="8">
        <v-card-title>Position löschen?</v-card-title>
        <v-card-text class="text-body-2">
          Diese Untertransaktion wird ausgeblendet (soft-delete). Der Beleg und die übrigen Positionen bleiben erhalten.
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
  </div>
</template>

<style scoped>
.nx-receipt-tech-details > summary {
  cursor: pointer;
  user-select: none;
  list-style: none;
}
.nx-receipt-tech-details > summary::-webkit-details-marker {
  display: none;
}
.nx-receipt-tech-chevron {
  transition: transform 0.15s ease;
}
.nx-receipt-tech-details[open] .nx-receipt-tech-chevron {
  transform: rotate(90deg);
}
</style>
