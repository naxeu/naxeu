<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "@/api/client";
import { formatDate } from "@/utils/format";

interface Rule {
  id: string;
  name: string;
  triggerType: string;
  conditions: Array<{ op: string; value?: string | number }>;
  actions: Array<{ type: string; categoryId?: string; status?: string; messageTitle?: string }>;
  priority: number;
  isActive: boolean;
}
interface Run { id: string; status: string; result: Record<string, unknown>; errorMessage: string | null; createdAt: string }
interface Category { id: string; name: string }

const rules = ref<Rule[]>([]);
const runs = ref<Run[]>([]);
const categories = ref<Category[]>([]);
const dialog = ref(false);
const error = ref("");

const form = ref({
  name: "",
  triggerType: "transaction.created",
  condOp: "merchant_contains",
  condValue: "",
  actionType: "set_category",
  categoryId: null as string | null,
  priority: 100,
});
const triggers = ["transaction.created", "transaction.updated", "attachment.created"];
const condOps = ["merchant_contains", "description_contains", "amount_greater_than", "amount_less_than", "category_empty"];
const actionTypes = ["set_category", "set_affects_budget", "set_status", "create_message"];

const catName = (id?: string) => categories.value.find((c) => c.id === id)?.name ?? id ?? "–";
const runRuleName = (run: Run): string => (run.result as { ruleName?: string }).ruleName ?? run.status;

async function load(): Promise<void> {
  const [r, ru, c] = await Promise.all([
    api<{ rules: Rule[] }>("/automation-rules"),
    api<{ runs: Run[] }>("/automation-runs"),
    api<{ categories: Category[] }>("/categories"),
  ]);
  rules.value = r.rules;
  runs.value = ru.runs;
  categories.value = c.categories;
}

async function save(): Promise<void> {
  error.value = "";
  const conditions = form.value.condOp === "category_empty"
    ? [{ op: form.value.condOp }]
    : [{ op: form.value.condOp, value: form.value.condValue }];
  const action: Record<string, unknown> = { type: form.value.actionType };
  if (form.value.actionType === "set_category") action.categoryId = form.value.categoryId;
  if (form.value.actionType === "create_message") {
    action.messageTitle = form.value.condValue || "Automation";
    action.messageType = "automation";
  }
  try {
    await api("/automation-rules", {
      method: "POST",
      body: { name: form.value.name, triggerType: form.value.triggerType, conditions, actions: [action], priority: form.value.priority },
    });
    dialog.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Fehler";
  }
}

async function toggle(rule: Rule): Promise<void> {
  await api(`/automation-rules/${rule.id}`, { method: "PUT", body: { isActive: !rule.isActive } });
  await load();
}
async function remove(rule: Rule): Promise<void> {
  await api(`/automation-rules/${rule.id}`, { method: "DELETE" });
  await load();
}

onMounted(load);
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h4 font-weight-bold">Automationen</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="dialog = true">Neue Regel</v-btn>
    </div>

    <v-alert type="info" variant="tonal" density="compact" class="mb-4">
      <strong>Belege:</strong> Sobald ein Beleg hochgeladen wird, verarbeitet der Hintergrund-Worker automatisch die Analyse (Ereignis
      <code>attachment.created</code>). Du brauchst dafür keine eigene Regel anzulegen. Der Trigger
      <code>attachment.created</code> bleibt für eigene Regeln verfügbar (zusätzliche Aktionen auf Basis von Beleg-Events).
    </v-alert>

    <v-row>
      <v-col cols="12" md="7">
        <v-card rounded="lg" border>
          <v-card-title>Regeln</v-card-title>
          <v-list>
            <v-list-item v-for="r in rules" :key="r.id">
              <v-list-item-title>{{ r.name }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ r.triggerType }} · Prio {{ r.priority }} ·
                <span v-for="(c, i) in r.conditions" :key="i">{{ c.op }} {{ c.value ?? '' }}</span>
                → <span v-for="(a, i) in r.actions" :key="i">{{ a.type }} {{ a.categoryId ? catName(a.categoryId) : '' }}</span>
              </v-list-item-subtitle>
              <template #append>
                <v-switch :model-value="r.isActive" color="success" density="compact" hide-details @update:model-value="toggle(r)" />
                <v-btn icon="mdi-delete" size="small" variant="text" @click="remove(r)" />
              </template>
            </v-list-item>
            <v-list-item v-if="rules.length === 0" title="Noch keine Regeln" />
          </v-list>
        </v-card>
      </v-col>

      <v-col cols="12" md="5">
        <v-card rounded="lg" border>
          <v-card-title>Letzte Ausführungen</v-card-title>
          <v-list density="compact">
            <v-list-item v-for="run in runs" :key="run.id">
              <template #prepend>
                <v-icon :color="run.status === 'success' ? 'success' : run.status === 'failed' ? 'error' : 'grey'">
                  {{ run.status === 'success' ? 'mdi-check-circle' : run.status === 'failed' ? 'mdi-alert-circle' : 'mdi-clock' }}
                </v-icon>
              </template>
              <v-list-item-title>{{ runRuleName(run) }}</v-list-item-title>
              <v-list-item-subtitle>{{ formatDate(run.createdAt) }} <span v-if="run.errorMessage" class="text-error">· {{ run.errorMessage }}</span></v-list-item-subtitle>
            </v-list-item>
            <v-list-item v-if="runs.length === 0" title="Noch keine Ausführungen" />
          </v-list>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="dialog" max-width="560" content-class="nx-dialog-panel">
      <v-card>
        <v-card-title>Neue Automationsregel</v-card-title>
        <v-card-text>
          <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>
          <v-text-field v-model="form.name" label="Name" variant="outlined" />
          <v-select v-model="form.triggerType" :items="triggers" label="Trigger" variant="outlined" />
          <v-row dense>
            <v-col cols="6"><v-select v-model="form.condOp" :items="condOps" label="Bedingung" variant="outlined" /></v-col>
            <v-col cols="6"><v-text-field v-model="form.condValue" label="Wert" variant="outlined" :disabled="form.condOp === 'category_empty'" /></v-col>
          </v-row>
          <v-select v-model="form.actionType" :items="actionTypes" label="Aktion" variant="outlined" />
          <v-select v-if="form.actionType === 'set_category'" v-model="form.categoryId" :items="categories" item-title="name" item-value="id" label="Kategorie" variant="outlined" />
          <v-text-field v-model.number="form.priority" label="Priorität (niedriger = zuerst)" type="number" variant="outlined" />
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
