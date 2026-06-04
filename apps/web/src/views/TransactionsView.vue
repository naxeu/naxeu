<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/api/client";
import { useRealtimeStore } from "@/stores/realtime";
import { formatDate, formatMoney, statusColor } from "@/utils/format";

interface Tx {
  id: string;
  type: string;
  status: string;
  amount: string;
  merchantName: string | null;
  description: string | null;
  categoryId: string | null;
  accountId: string | null;
  date: string;
  parentId: string | null;
}
interface Category { id: string; name: string }
interface Account { id: string; name: string }

const realtime = useRealtimeStore();
const router = useRouter();
const transactions = ref<Tx[]>([]);
const categories = ref<Category[]>([]);
const accounts = ref<Account[]>([]);
const loading = ref(true);

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
  const params = new URLSearchParams();
  if (filters.value.search) params.set("search", filters.value.search);
  if (filters.value.categoryId) params.set("categoryId", filters.value.categoryId);
  if (filters.value.accountId) params.set("accountId", filters.value.accountId);
  if (filters.value.status) params.set("status", filters.value.status);
  const res = await api<{ transactions: Tx[] }>(`/transactions?${params.toString()}`);
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

function openRow(_e: unknown, ctx: { item: Tx }): void {
  void router.push(`/transactions/${ctx.item.id}`);
}

const headers = [
  { title: "Datum", key: "date" },
  { title: "Händler / Beschreibung", key: "merchant" },
  { title: "Kategorie", key: "category" },
  { title: "Status", key: "status" },
  { title: "Betrag", key: "amount", align: "end" as const },
];
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
            <v-text-field v-model="filters.search" label="Suche" prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" hide-details clearable />
          </v-col>
          <v-col cols="12" md="3">
            <v-select v-model="filters.categoryId" :items="categories" item-title="name" item-value="id" label="Kategorie" variant="outlined" density="compact" hide-details clearable />
          </v-col>
          <v-col cols="12" md="3">
            <v-select v-model="filters.accountId" :items="accounts" item-title="name" item-value="id" label="Konto" variant="outlined" density="compact" hide-details clearable />
          </v-col>
          <v-col cols="12" md="2">
            <v-select v-model="filters.status" :items="statuses" label="Status" variant="outlined" density="compact" hide-details clearable />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card rounded="lg" border>
      <v-data-table :headers="headers" :items="transactions" :loading="loading" item-value="id" hover @click:row="openRow">
        <template #[`item.date`]="{ item }">{{ formatDate(item.date) }}</template>
        <template #[`item.merchant`]="{ item }">
          <v-icon v-if="item.parentId" size="x-small" class="mr-1">mdi-subdirectory-arrow-right</v-icon>
          {{ item.merchantName ?? item.description ?? "–" }}
        </template>
        <template #[`item.category`]="{ item }">{{ catName(item.categoryId) }}</template>
        <template #[`item.status`]="{ item }">
          <v-chip :color="statusColor[item.status]" size="small">{{ item.status }}</v-chip>
        </template>
        <template #[`item.amount`]="{ item }">
          <span :class="Number(item.amount) >= 0 ? 'text-success' : 'text-error'">{{ formatMoney(item.amount) }}</span>
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>
