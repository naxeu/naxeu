<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "@/api/client";
import { useRealtimeStore } from "@/stores/realtime";
import { formatDate, formatMoney } from "@/utils/format";
import { extractedAttachmentSchema } from "@naxeu/shared";
import AttachmentThumbnail from "@/components/AttachmentThumbnail.vue";

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

interface LinkedLedgerTransaction {
  id: string;
  merchantName: string | null;
  description: string | null;
  date: string;
  amount: string;
  source: string;
}

const route = useRoute();
const router = useRouter();
const realtime = useRealtimeStore();

const id = computed(() => String(route.params.id));

const error = ref("");
const loading = ref(true);
const analyzing = ref(false);
const attachment = ref<Attachment | null>(null);
const linkedLedgerTransaction = ref<LinkedLedgerTransaction | null>(null);
const deleteReceiptOpen = ref(false);
const deleteReceiptLoading = ref(false);

const parsedExtracted = computed(() => {
  const raw = attachment.value?.extractedData;
  if (!raw || typeof raw !== "object") return null;
  const parsed = extractedAttachmentSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
});

const ledgerTxLabel = computed(() => {
  const l = linkedLedgerTransaction.value;
  if (!l) return "";
  return l.merchantName?.trim() || l.description?.trim() || "Buchung";
});

async function loadDetail(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const res = await api<{
      attachment: Attachment;
      transactionTree: unknown;
      linkedLedgerTransaction?: LinkedLedgerTransaction | null;
    }>(`/attachments/${id.value}`);
    attachment.value = res.attachment;
    linkedLedgerTransaction.value = res.linkedLedgerTransaction ?? null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Laden fehlgeschlagen";
    attachment.value = null;
    linkedLedgerTransaction.value = null;
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

function goToReceiptTransaction(): void {
  const tid = attachment.value?.transactionId;
  if (tid) void router.push({ name: "transaction-detail", params: { id: tid } });
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

      <template v-if="attachment.status === 'processed'">
        <v-alert v-if="linkedLedgerTransaction" type="success" variant="tonal" density="comfortable" class="mb-4">
          <div class="text-body-2">
            <strong>Mit Konto-Transaktion verknüpft:</strong>
            {{ ledgerTxLabel }} · {{ formatDate(linkedLedgerTransaction.date) }} ·
            {{ formatMoney(linkedLedgerTransaction.amount) }}
            <span class="text-medium-emphasis">({{ linkedLedgerTransaction.source }})</span>
          </div>
          <v-btn
            class="mt-3"
            color="primary"
            variant="flat"
            size="small"
            prepend-icon="mdi-arrow-right-bold"
            :to="{ name: 'transaction-detail', params: { id: linkedLedgerTransaction.id } }"
          >
            Zur Konto-Buchung
          </v-btn>
        </v-alert>
        <v-alert v-else-if="attachment.transactionId" type="info" variant="tonal" density="comfortable" class="mb-4">
          Dieser Beleg ist noch nicht mit einer Konto-Import- oder manuellen Buchung zusammengeführt.
        </v-alert>
      </template>

      <v-row>
        <v-col cols="12" md="5">
          <v-card rounded="lg" border>
            <AttachmentThumbnail
              :attachment-id="attachment.id"
              :mime-type="attachment.mimeType"
              variant="detail"
            />
            <v-card-text v-if="attachment.extractedText" class="text-caption">{{ attachment.extractedText }}</v-card-text>
          </v-card>

          <v-btn
            v-if="attachment.status === 'processed' && attachment.transactionId"
            color="primary"
            size="large"
            block
            class="mt-4"
            prepend-icon="mdi-file-document-edit-outline"
            @click="goToReceiptTransaction"
          >
            Buchung &amp; Belegpositionen bearbeiten
          </v-btn>
          <v-alert v-else-if="attachment.status === 'processed' && !attachment.transactionId" type="warning" variant="tonal" density="compact" class="mt-4">
            Noch keine Buchung verknüpft.
          </v-alert>
          <v-alert v-else type="info" variant="tonal" density="compact" class="mt-4 text-body-2">
            Sobald die Analyse abgeschlossen ist, erscheint hier der Button zur Buchung.
          </v-alert>
        </v-col>

        <v-col cols="12" md="7">
          <v-card rounded="lg" border>
            <v-card-title>Geparste Daten</v-card-title>
            <v-card-text v-if="parsedExtracted" class="text-body-2">
              <div class="mb-2"><strong>Händler:</strong> {{ parsedExtracted.merchantName ?? "–" }}</div>
              <div class="mb-2"><strong>Datum:</strong> {{ parsedExtracted.date ?? "–" }}</div>
              <div class="mb-2"><strong>Summe:</strong> {{ parsedExtracted.total ?? "–" }} {{ parsedExtracted.currency }}</div>
              <div class="mb-2"><strong>Konfidenz:</strong> {{ parsedExtracted.confidence }}</div>
              <div class="text-subtitle-2 mt-4 mb-1">Positionen (Extrakt)</div>
              <v-table v-if="parsedExtracted.lineItems.length" density="compact" class="bg-transparent">
                <thead>
                  <tr>
                    <th>Beschreibung</th>
                    <th class="text-end">Betrag</th>
                    <th>Kategorie-Hinweis</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(li, i) in parsedExtracted.lineItems" :key="i">
                    <td>{{ li.description }}</td>
                    <td class="text-end">{{ li.amount }}</td>
                    <td>{{ li.categoryHint ?? "–" }}</td>
                  </tr>
                </tbody>
              </v-table>
              <p v-else class="text-medium-emphasis">Keine Positionen in den extrahierten Daten.</p>
            </v-card-text>
            <v-card-text v-else-if="attachment.status === 'processed'" class="text-medium-emphasis">
              Keine strukturierten Extraktionsdaten vorhanden.
            </v-card-text>
            <v-card-text v-else class="text-medium-emphasis">Nach der Analyse erscheinen hier die erkannten Felder.</v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-dialog v-model="deleteReceiptOpen" max-width="440" content-class="nx-dialog-panel">
        <v-card variant="elevated" color="surface" rounded="lg" elevation="8">
          <v-card-title>Beleg löschen?</v-card-title>
          <v-card-text class="text-body-2">
            Die Belegdatei und die Metadaten werden entfernt. Bereits angelegte Buchungen aus diesem Beleg werden mit
            allen Positionen ausgeblendet (soft-delete) und in den Standard-Ansichten nicht mehr angezeigt.
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
    </template>
  </div>
</template>
