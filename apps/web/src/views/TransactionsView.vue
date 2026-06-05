<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/api/client";
import TransactionTreeRow from "@/components/TransactionTreeRow.vue";
import { useRealtimeStore } from "@/stores/realtime";
import { formatMoney } from "@/utils/format";
import { buildTransactionForest, type TxFlat } from "@/utils/transaction-tree";

interface Category {
  id: string;
  name: string;
}
interface Account {
  id: string;
  name: string;
}

const realtime = useRealtimeStore();
const router = useRouter();
const transactions = ref<TxFlat[]>([]);
const categories = ref<Category[]>([]);
const accounts = ref<Account[]>([]);
const loading = ref(true);
const page = ref(1);
const perPage = ref(10);

const forest = computed(() => buildTransactionForest(transactions.value));

const totalPages = computed(() => Math.max(1, Math.ceil(forest.value.length / perPage.value)));

const paginatedRoots = computed(() => {
  const start = (page.value - 1) * perPage.value;
  return forest.value.slice(start, start + perPage.value);
});

/** Sum of root rows on the current page only (children are separate bookings; summing all visible rows would double-count hierarchies). */
const sumRootsThisPage = computed(() =>
  paginatedRoots.value.reduce((sum, n) => sum + Number(n.tx.amount), 0),
);

watch([forest, perPage], () => {
  if (page.value > totalPages.value) page.value = totalPages.value;
});

const filters = ref({
  search: "",
  categoryId: null as string | null,
  accountId: null as string | null,
  status: null as string | null,
});
const statuses = ["draft", "pending_review", "confirmed", "ignored", "archived"];

const catName = (id: string | null) => categories.value.find((c) => c.id === id)?.name ?? "–";

async function load(): Promise<void> {
  loading.value = true;
  page.value = 1;
  const params = new URLSearchParams();
  params.set("limit", "200");
  if (filters.value.search) params.set("search", filters.value.search);
  if (filters.value.categoryId) params.set("categoryId", filters.value.categoryId);
  if (filters.value.accountId) params.set("accountId", filters.value.accountId);
  if (filters.value.status) params.set("status", filters.value.status);
  const res = await api<{ transactions: TxFlat[] }>(`/transactions?${params.toString()}`);
  transactions.value = res.transactions;
  loading.value = false;
}

onMounted(async () => {
  const [c, a] = await Promise.all([
    api<{ categories: Category[] }>("/categories"),
    api<{ accounts: Account[] }>("/accounts"),
  ]);
  categories.value = c.categories;
  accounts.value = a.accounts;
  await load();
});

watch(filters, () => void load(), { deep: true });
watch(
  () => realtime.lastEvent,
  (ev) => {
    if (ev && ev.entityType === "transaction") void load();
  },
);

function goTo(id: string): void {
  void router.push(`/transactions/${id}`);
}

function onPerPageChange(): void {
  page.value = 1;
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h4 font-weight-bold">Transaktionen</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" to="/transactions/add">Neu</v-btn>
    </div>

    <v-card rounded="lg" border class="mb-4">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" md="4">
            <v-text-field
              v-model="filters.search"
              label="Suche"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              hide-details
              clearable
            />
          </v-col>
          <v-col cols="12" md="3">
            <v-select
              v-model="filters.categoryId"
              :items="categories"
              item-title="name"
              item-value="id"
              label="Kategorie"
              variant="outlined"
              density="compact"
              hide-details
              clearable
            />
          </v-col>
          <v-col cols="12" md="3">
            <v-select
              v-model="filters.accountId"
              :items="accounts"
              item-title="name"
              item-value="id"
              label="Konto"
              variant="outlined"
              density="compact"
              hide-details
              clearable
            />
          </v-col>
          <v-col cols="12" md="2">
            <v-select
              v-model="filters.status"
              :items="statuses"
              label="Status"
              variant="outlined"
              density="compact"
              hide-details
              clearable
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card rounded="lg" border>
      <v-progress-linear v-if="loading" indeterminate height="3" color="primary" />
      <div class="overflow-x-auto">
        <v-table v-if="forest.length > 0" class="tx-tree-table" density="comfortable">
          <thead>
            <tr>
              <th class="text-left" style="width: 7rem">Datum</th>
              <th class="text-left">Händler / Beschreibung</th>
              <th class="text-left" style="width: 10rem">Kategorie</th>
              <th class="text-left" style="width: 8rem">Status</th>
              <th class="text-end" style="width: 8rem">Betrag</th>
            </tr>
          </thead>
          <tbody>
            <TransactionTreeRow
              v-for="root in paginatedRoots"
              :key="root.tx.id"
              :node="root"
              :depth="0"
              :visible="true"
              :cat-name="catName"
              @open="goTo"
            />
          </tbody>
          <tfoot>
            <tr class="tx-tree-foot text-body-2">
              <td colspan="4" class="text-medium-emphasis py-3">
                Zwischensumme nur <strong>Wurzeln</strong> auf dieser Seite (Kinderzeilen nicht addiert, um Doppelzählung zu vermeiden).
              </td>
              <td class="text-end font-weight-bold py-3">
                <span :class="sumRootsThisPage >= 0 ? 'text-success' : 'text-error'">{{ formatMoney(sumRootsThisPage) }}</span>
              </td>
            </tr>
          </tfoot>
        </v-table>
        <v-card-text v-else-if="!loading" class="text-medium-emphasis text-center py-10">
          Keine Transaktionen für die aktuellen Filter.
        </v-card-text>
      </div>
      <v-card-actions v-if="forest.length > 0" class="flex-wrap align-center border-t pa-3 ga-3">
        <div class="text-caption text-medium-emphasis">
          {{ forest.length }} Wurzel{{ forest.length === 1 ? "" : "n" }} · {{ transactions.length }} Zeile{{ transactions.length === 1 ? "" : "n" }} geladen
          <span v-if="transactions.length >= 200"> (API-Maximum)</span>
        </div>
        <v-select
          v-model="perPage"
          :items="[10, 25, 50, 100]"
          label="Wurzeln pro Seite"
          variant="outlined"
          density="compact"
          hide-details
          class="tx-per-page-select"
          @update:model-value="onPerPageChange"
        />
        <v-spacer />
        <v-pagination v-model="page" :length="totalPages" rounded="circle" density="comfortable" />
      </v-card-actions>
    </v-card>
  </div>
</template>

<style scoped>
.tx-tree-table :deep(th) {
  font-weight: 600;
  white-space: nowrap;
}
.tx-tree-foot {
  background: rgba(var(--v-theme-on-surface), 0.05);
}
.tx-per-page-select {
  max-width: 11rem;
  min-width: 9rem;
}
</style>
