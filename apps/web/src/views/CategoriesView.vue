<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "@/api/client";
import { formatMoney } from "@/utils/format";

interface Category {
  id: string;
  name: string;
  type: string;
  monthlyBudget: string | null;
  budgetAlertThreshold: string | null;
  isArchived: boolean;
}

const categories = ref<Category[]>([]);
const dialog = ref(false);
const editing = ref<Category | null>(null);
const error = ref("");
const form = ref({ name: "", type: "expense", monthlyBudget: "", budgetAlertThreshold: 0.8 });
const types = ["income", "expense", "transfer"];

async function load(): Promise<void> {
  const res = await api<{ categories: Category[] }>("/categories");
  categories.value = res.categories.filter((c) => !c.isArchived);
}

function openNew(): void {
  editing.value = null;
  form.value = { name: "", type: "expense", monthlyBudget: "", budgetAlertThreshold: 0.8 };
  dialog.value = true;
}

function openEdit(c: Category): void {
  editing.value = c;
  form.value = {
    name: c.name,
    type: c.type,
    monthlyBudget: c.monthlyBudget ?? "",
    budgetAlertThreshold: c.budgetAlertThreshold ? Number(c.budgetAlertThreshold) : 0.8,
  };
  dialog.value = true;
}

async function save(): Promise<void> {
  error.value = "";
  const body = {
    name: form.value.name,
    type: form.value.type,
    monthlyBudget: form.value.monthlyBudget ? form.value.monthlyBudget : null,
    budgetAlertThreshold: form.value.budgetAlertThreshold,
  };
  try {
    if (editing.value) {
      await api(`/categories/${editing.value.id}`, { method: "PUT", body });
    } else {
      await api("/categories", { method: "POST", body });
    }
    dialog.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Fehler";
  }
}

async function archive(c: Category): Promise<void> {
  await api(`/categories/${c.id}`, { method: "DELETE" });
  await load();
}

onMounted(load);
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h4 font-weight-bold">Kategorien & Budgets</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openNew">Neue Kategorie</v-btn>
    </div>

    <v-row>
      <v-col v-for="c in categories" :key="c.id" cols="12" sm="6" md="4">
        <v-card rounded="lg" border>
          <v-card-text>
            <div class="d-flex align-center">
              <div>
                <div class="text-subtitle-1 font-weight-bold">{{ c.name }}</div>
                <v-chip size="x-small" class="mt-1">{{ c.type }}</v-chip>
              </div>
              <v-spacer />
              <v-btn icon="mdi-pencil" size="small" variant="text" @click="openEdit(c)" />
              <v-btn icon="mdi-archive" size="small" variant="text" @click="archive(c)" />
            </div>
            <div class="mt-3">
              <span class="text-medium-emphasis">Budget: </span>
              <strong>{{ c.monthlyBudget ? formatMoney(c.monthlyBudget) : "kein Budget" }}</strong>
              <span v-if="c.monthlyBudget" class="text-caption ml-2">
                Warnung bei {{ Math.round(Number(c.budgetAlertThreshold ?? 0.8) * 100) }}%
              </span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="dialog" max-width="500">
      <v-card>
        <v-card-title>{{ editing ? "Kategorie bearbeiten" : "Neue Kategorie" }}</v-card-title>
        <v-card-text>
          <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>
          <v-text-field v-model="form.name" label="Name" variant="outlined" />
          <v-select v-model="form.type" :items="types" label="Typ" variant="outlined" />
          <v-text-field v-model="form.monthlyBudget" label="Monatsbudget (€)" variant="outlined" type="text" hint="Leer lassen für kein Budget" persistent-hint />
          <div class="mt-4">Warnschwelle: {{ Math.round(form.budgetAlertThreshold * 100) }}%</div>
          <v-slider v-model="form.budgetAlertThreshold" :min="0.1" :max="1" :step="0.05" thumb-label />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="dialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="save">Speichern</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
