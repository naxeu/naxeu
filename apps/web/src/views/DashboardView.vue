<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { api } from "@/api/client";
import { useRealtimeStore } from "@/stores/realtime";
import { currentMonthKey, formatMoney, severityColor } from "@/utils/format";

interface Tx {
  id: string;
  type: string;
  amount: string;
  status: string;
  merchantName: string | null;
  description: string | null;
  date: string;
}
interface BudgetCat {
  categoryId: string;
  name: string;
  spent: string;
  monthlyBudget: string | null;
  usedFraction: number | null;
  thresholdReached: boolean;
}
interface Msg {
  id: string;
  type: string;
  severity: string;
  title: string;
  status: string;
  createdAt: string;
}

const realtime = useRealtimeStore();
const month = currentMonthKey();
const loading = ref(true);

const income = ref(0);
const expense = ref(0);
const budget = ref({ totalBudget: "0", totalSpent: "0", totalRemaining: "0", categories: [] as BudgetCat[] });
const messages = ref<Msg[]>([]);
const openTx = ref<Tx[]>([]);

const topCategories = computed(() =>
  [...budget.value.categories].sort((a, b) => Number(b.spent) - Number(a.spent)).slice(0, 5),
);

async function load(): Promise<void> {
  const [yyyy, mm] = month.split("-");
  const from = `${yyyy}-${mm}-01`;
  const to = `${yyyy}-${mm}-31`;
  const [txRes, budgetRes, msgRes, openRes] = await Promise.all([
    api<{ transactions: Tx[] }>(`/transactions?from=${from}&to=${to}&rootOnly=true&limit=200`),
    api<typeof budget.value>(`/budgets/monthly?month=${month}`),
    api<{ messages: Msg[] }>("/messages?limit=5"),
    api<{ transactions: Tx[] }>("/transactions?status=pending_review&limit=10"),
  ]);
  income.value = txRes.transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  expense.value = txRes.transactions
    .filter((t) => t.type !== "income")
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  budget.value = budgetRes;
  messages.value = msgRes.messages.slice(0, 5);
  openTx.value = openRes.transactions;
  loading.value = false;
}

onMounted(load);
watch(() => realtime.lastEvent, () => void load());
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-1">Dashboard</h1>
    <p class="text-medium-emphasis mb-6">Übersicht für {{ month }}</p>

    <v-row>
      <v-col cols="12" sm="6" md="3">
        <v-card color="success" variant="tonal" rounded="lg">
          <v-card-text>
            <div class="text-overline">Einnahmen</div>
            <div class="text-h5 font-weight-bold">{{ formatMoney(income) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card color="error" variant="tonal" rounded="lg">
          <v-card-text>
            <div class="text-overline">Ausgaben</div>
            <div class="text-h5 font-weight-bold">{{ formatMoney(expense) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card color="primary" variant="tonal" rounded="lg">
          <v-card-text>
            <div class="text-overline">Budget verfügbar</div>
            <div class="text-h5 font-weight-bold">{{ formatMoney(budget.totalRemaining) }}</div>
            <div class="text-caption">von {{ formatMoney(budget.totalBudget) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card variant="tonal" rounded="lg">
          <v-card-text>
            <div class="text-overline">Budget genutzt</div>
            <div class="text-h5 font-weight-bold">{{ formatMoney(budget.totalSpent) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row class="mt-2">
      <v-col cols="12" md="6">
        <v-card rounded="lg" border>
          <v-card-title>Top-Kategorien</v-card-title>
          <v-list>
            <v-list-item v-for="c in topCategories" :key="c.categoryId" :title="c.name">
              <template #subtitle>
                {{ formatMoney(c.spent) }}<span v-if="c.monthlyBudget"> / {{ formatMoney(c.monthlyBudget) }}</span>
              </template>
              <template #append>
                <v-chip v-if="c.thresholdReached" color="warning" size="small">⚠ Limit</v-chip>
              </template>
              <v-progress-linear
                v-if="c.usedFraction !== null"
                :model-value="Math.min(c.usedFraction * 100, 100)"
                :color="c.thresholdReached ? 'warning' : 'primary'"
                height="6"
                rounded
                class="mt-1"
              />
            </v-list-item>
            <v-list-item v-if="topCategories.length === 0" title="Noch keine Ausgaben" />
          </v-list>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card rounded="lg" border class="mb-4">
          <v-card-title class="d-flex align-center">
            Aktuelle Nachrichten
            <v-spacer />
            <v-btn variant="text" size="small" to="/messages">Alle</v-btn>
          </v-card-title>
          <v-list>
            <v-list-item
              v-for="m in messages"
              :key="m.id"
              :title="m.title"
              :prepend-icon="'mdi-bell'"
            >
              <template #append>
                <v-chip :color="severityColor[m.severity]" size="x-small">{{ m.severity }}</v-chip>
              </template>
            </v-list-item>
            <v-list-item v-if="messages.length === 0" title="Keine Nachrichten" />
          </v-list>
        </v-card>

        <v-card rounded="lg" border>
          <v-card-title>Offene Transaktionen zur Prüfung</v-card-title>
          <v-list>
            <v-list-item
              v-for="t in openTx"
              :key="t.id"
              :title="t.merchantName ?? t.description ?? 'Transaktion'"
              :subtitle="t.date"
              :to="`/transactions/${t.id}`"
            >
              <template #append>{{ formatMoney(t.amount) }}</template>
            </v-list-item>
            <v-list-item v-if="openTx.length === 0" title="Keine offenen Transaktionen" />
          </v-list>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
