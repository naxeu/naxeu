<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { api } from "@/api/client";
import { currentMonthKey, formatMoney } from "@/utils/format";

interface BudgetCat {
  categoryId: string;
  name: string;
  spent: string;
  monthlyBudget: string | null;
  remaining: string | null;
  usedFraction: number | null;
  thresholdReached: boolean;
  overBudget: boolean;
}
interface Result {
  month: string;
  totalBudget: string;
  totalSpent: string;
  totalRemaining: string;
  categories: BudgetCat[];
}

const month = ref(currentMonthKey());
const result = ref<Result | null>(null);

async function load(): Promise<void> {
  result.value = await api<Result>(`/budgets/monthly?month=${month.value}`);
}

onMounted(load);
watch(month, () => void load());
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h4 font-weight-bold">Budgets</h1>
      <v-spacer />
      <v-text-field v-model="month" label="Monat" type="month" variant="outlined" density="compact" hide-details style="max-width: 200px" />
    </div>

    <v-row v-if="result">
      <v-col cols="12" sm="4">
        <v-card color="primary" variant="tonal" rounded="lg"><v-card-text><div class="text-overline">Gesamtbudget</div><div class="text-h5 font-weight-bold">{{ formatMoney(result.totalBudget) }}</div></v-card-text></v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card color="error" variant="tonal" rounded="lg"><v-card-text><div class="text-overline">Ausgegeben</div><div class="text-h5 font-weight-bold">{{ formatMoney(result.totalSpent) }}</div></v-card-text></v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card color="success" variant="tonal" rounded="lg"><v-card-text><div class="text-overline">Verbleibend</div><div class="text-h5 font-weight-bold">{{ formatMoney(result.totalRemaining) }}</div></v-card-text></v-card>
      </v-col>
    </v-row>

    <v-card rounded="lg" border class="mt-4" v-if="result">
      <v-list>
        <v-list-item v-for="c in result.categories" :key="c.categoryId">
          <template #title>
            <div class="d-flex justify-space-between">
              <span class="font-weight-medium">{{ c.name }}</span>
              <span>
                {{ formatMoney(c.spent) }}<template v-if="c.monthlyBudget"> / {{ formatMoney(c.monthlyBudget) }}</template>
                <v-chip v-if="c.overBudget" color="error" size="x-small" class="ml-2">über Budget</v-chip>
                <v-chip v-else-if="c.thresholdReached" color="warning" size="x-small" class="ml-2">Schwelle erreicht</v-chip>
              </span>
            </div>
          </template>
          <v-progress-linear
            v-if="c.usedFraction !== null"
            :model-value="Math.min(c.usedFraction * 100, 100)"
            :color="c.overBudget ? 'error' : c.thresholdReached ? 'warning' : 'primary'"
            height="8"
            rounded
            class="mt-2"
          />
          <div v-else class="text-caption text-medium-emphasis mt-1">Kein Budget gesetzt</div>
        </v-list-item>
      </v-list>
    </v-card>
  </div>
</template>
