<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "@/api/client";
import { TransactionStatus, TransactionType } from "@naxeu/shared";
import { formatDate, formatMoney, statusColor } from "@/utils/format";

interface Tx {
  id: string;
  type: string;
  status: string;
  amount: string;
  merchantName: string | null;
  description: string | null;
  notes: string | null;
  categoryId: string | null;
  accountId: string | null;
  date: string;
  parentId: string | null;
  affectsBudget: boolean;
  affectsAccountBalance: boolean;
}
interface TreeNode {
  node: Tx;
  children: TreeNode[];
}
interface Category {
  id: string;
  name: string;
}
interface Account {
  id: string;
  name: string;
}

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));

const tx = ref<Tx | null>(null);
const tree = ref<TreeNode | null>(null);
const categories = ref<Category[]>([]);
const accounts = ref<Account[]>([]);
const addChildOpen = ref(false);
const childForm = ref({ amount: "", merchantName: "", categoryId: null as string | null, type: "item" });
const error = ref("");

const editing = ref(false);
const saving = ref(false);
const editForm = ref({
  type: "expense",
  amount: "",
  date: "",
  merchantName: "",
  description: "",
  notes: "",
  categoryId: null as string | null,
  accountId: null as string | null,
  status: "confirmed",
  affectsBudget: true,
  affectsAccountBalance: true,
});

const txTypes = [...TransactionType.values];
const txStatuses = [...TransactionStatus.values];

const catName = (cid: string | null) => categories.value.find((c) => c.id === cid)?.name ?? "–";
const accName = (aid: string | null) => accounts.value.find((a) => a.id === aid)?.name ?? "–";

function syncEditForm(): void {
  const t = tx.value;
  if (!t) return;
  editForm.value = {
    type: t.type,
    amount: String(t.amount).replace(",", "."),
    date: typeof t.date === "string" ? t.date.slice(0, 10) : String(t.date).slice(0, 10),
    merchantName: t.merchantName ?? "",
    description: t.description ?? "",
    notes: t.notes ?? "",
    categoryId: t.categoryId,
    accountId: t.accountId,
    status: t.status,
    affectsBudget: t.affectsBudget,
    affectsAccountBalance: t.affectsAccountBalance,
  };
}

async function load(): Promise<void> {
  const tid = id.value;
  const [t, tr, c, a] = await Promise.all([
    api<{ transaction: Tx }>(`/transactions/${tid}`),
    api<{ tree: TreeNode }>(`/transactions/${tid}/tree`),
    api<{ categories: Category[] }>("/categories"),
    api<{ accounts: Account[] }>("/accounts"),
  ]);
  tx.value = t.transaction;
  tree.value = tr.tree;
  categories.value = c.categories;
  accounts.value = a.accounts;
}

function startEdit(): void {
  syncEditForm();
  editing.value = true;
  error.value = "";
}

function cancelEdit(): void {
  editing.value = false;
  syncEditForm();
  error.value = "";
}

async function saveEdit(): Promise<void> {
  saving.value = true;
  error.value = "";
  try {
    const amt = editForm.value.amount.trim().replace(",", ".");
    await api<{ transaction: Tx }>(`/transactions/${id.value}`, {
      method: "PUT",
      body: {
        type: editForm.value.type,
        amount: amt,
        date: editForm.value.date,
        merchantName: editForm.value.merchantName.trim() || null,
        description: editForm.value.description.trim() || null,
        notes: editForm.value.notes.trim() || null,
        categoryId: editForm.value.categoryId,
        accountId: editForm.value.accountId,
        status: editForm.value.status,
        affectsBudget: editForm.value.affectsBudget,
        affectsAccountBalance: editForm.value.affectsAccountBalance,
      },
    });
    editing.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Speichern fehlgeschlagen";
  } finally {
    saving.value = false;
  }
}

async function addChild(): Promise<void> {
  error.value = "";
  try {
    await api(`/transactions/${id.value}/children`, {
      method: "POST",
      body: {
        type: childForm.value.type,
        amount: childForm.value.amount.trim().replace(",", "."),
        date: tx.value?.date,
        merchantName: childForm.value.merchantName || null,
        description: childForm.value.merchantName || null,
        categoryId: childForm.value.categoryId,
        affectsAccountBalance: false,
        affectsBudget: true,
      },
    });
    addChildOpen.value = false;
    childForm.value = { amount: "", merchantName: "", categoryId: null, type: "item" };
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Fehler";
  }
}

async function remove(): Promise<void> {
  await api(`/transactions/${id.value}`, { method: "DELETE" });
  await router.push({ name: "transactions" });
}

function openChild(cid: string): void {
  void router.push({ name: "transaction-detail", params: { id: cid } });
}

onMounted(() => void load());
watch(id, () => {
  editing.value = false;
  void load();
});
</script>

<template>
  <div v-if="tx">
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" to="/transactions" />
      <h1 class="text-h4 font-weight-bold ml-2">{{ tx.merchantName ?? "Transaktion" }}</h1>
      <v-spacer />
      <v-btn
        v-if="!editing"
        color="primary"
        variant="tonal"
        class="mr-2"
        prepend-icon="mdi-pencil"
        @click="startEdit"
      >
        Bearbeiten
      </v-btn>
      <v-btn color="error" variant="text" prepend-icon="mdi-delete" @click="remove">Löschen</v-btn>
    </div>
    <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>

    <v-row>
      <v-col cols="12" md="5">
        <v-card rounded="lg" border>
          <v-card-title class="d-flex align-center">
            <span>{{ editing ? "Bearbeiten" : "Details" }}</span>
            <v-spacer />
            <template v-if="editing">
              <v-btn size="small" variant="text" @click="cancelEdit">Abbrechen</v-btn>
              <v-btn size="small" color="primary" :loading="saving" @click="saveEdit">Speichern</v-btn>
            </template>
          </v-card-title>

          <v-card-text v-if="editing">
            <v-row dense>
              <v-col cols="12" sm="6">
                <v-select v-model="editForm.type" :items="txTypes" label="Typ" variant="outlined" density="compact" />
              </v-col>
              <v-col cols="12" sm="6">
                <v-select v-model="editForm.status" :items="txStatuses" label="Status" variant="outlined" density="compact" />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field v-model="editForm.amount" label="Betrag (€)" variant="outlined" density="compact" />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field v-model="editForm.date" label="Datum" type="date" variant="outlined" density="compact" />
              </v-col>
              <v-col cols="12">
                <v-text-field v-model="editForm.merchantName" label="Händler" variant="outlined" density="compact" />
              </v-col>
              <v-col cols="12">
                <v-text-field v-model="editForm.description" label="Beschreibung" variant="outlined" density="compact" />
              </v-col>
              <v-col cols="12">
                <v-textarea v-model="editForm.notes" label="Notizen" variant="outlined" density="compact" rows="2" auto-grow />
              </v-col>
              <v-col cols="12">
                <v-select
                  v-model="editForm.categoryId"
                  :items="categories"
                  item-title="name"
                  item-value="id"
                  label="Kategorie"
                  variant="outlined"
                  density="compact"
                  clearable
                />
              </v-col>
              <v-col cols="12">
                <v-select
                  v-model="editForm.accountId"
                  :items="accounts"
                  item-title="name"
                  item-value="id"
                  label="Konto"
                  variant="outlined"
                  density="compact"
                  clearable
                />
              </v-col>
              <v-col cols="12">
                <v-switch v-model="editForm.affectsBudget" label="Zählt fürs Budget" color="primary" density="compact" hide-details />
                <v-switch v-model="editForm.affectsAccountBalance" label="Zählt fürs Kontosaldo" color="primary" density="compact" hide-details />
              </v-col>
            </v-row>
          </v-card-text>

          <v-list v-else density="compact">
            <v-list-item title="Betrag" :subtitle="formatMoney(tx.amount)" />
            <v-list-item title="Datum" :subtitle="formatDate(tx.date)" />
            <v-list-item title="Typ" :subtitle="tx.type" />
            <v-list-item title="Konto" :subtitle="accName(tx.accountId)" />
            <v-list-item title="Kategorie" :subtitle="catName(tx.categoryId)" />
            <v-list-item title="Beschreibung" :subtitle="tx.description ?? '–'" />
            <v-list-item v-if="tx.notes" title="Notizen" :subtitle="tx.notes" />
            <v-list-item>
              <template #title>Status</template>
              <template #subtitle>
                <v-chip :color="statusColor[tx.status] ?? 'grey'" size="small">{{ tx.status }}</v-chip>
              </template>
            </v-list-item>
            <v-list-item>
              <template #title>Flags</template>
              <template #subtitle>
                <v-chip size="x-small" :color="tx.affectsBudget ? 'primary' : 'grey'" class="mr-1">Budget: {{ tx.affectsBudget }}</v-chip>
                <v-chip size="x-small" :color="tx.affectsAccountBalance ? 'primary' : 'grey'">Konto: {{ tx.affectsAccountBalance }}</v-chip>
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>

      <v-col cols="12" md="7">
        <v-card rounded="lg" border>
          <v-card-title class="d-flex align-center">
            Transaktionsbaum
            <v-spacer />
            <v-btn size="small" color="primary" prepend-icon="mdi-plus" @click="addChildOpen = true">Untertransaktion</v-btn>
          </v-card-title>
          <v-card-text>
            <div v-if="tree">
              <div class="tree-node d-flex justify-space-between py-1">
                <strong>{{ tree.node.merchantName ?? tree.node.description ?? "Transaktion" }}</strong>
                <strong>{{ formatMoney(tree.node.amount) }}</strong>
              </div>
              <div v-for="child in tree.children" :key="child.node.id" class="ml-4">
                <div
                  class="d-flex justify-space-between py-1 border-t tree-child-row"
                  role="button"
                  tabindex="0"
                  @click="openChild(child.node.id)"
                  @keydown.enter.prevent="openChild(child.node.id)"
                >
                  <span>
                    ↳ {{ child.node.merchantName ?? child.node.description }}
                    <small class="text-medium-emphasis">({{ catName(child.node.categoryId) }})</small>
                    <v-icon size="x-small" class="ml-1 text-medium-emphasis">mdi-chevron-right</v-icon>
                  </span>
                  <span>{{ formatMoney(child.node.amount) }}</span>
                </div>
                <div
                  v-for="g in child.children"
                  :key="g.node.id"
                  class="ml-8 d-flex justify-space-between py-1 tree-child-row"
                  role="button"
                  tabindex="0"
                  @click="openChild(g.node.id)"
                  @keydown.enter.prevent="openChild(g.node.id)"
                >
                  <span>
                    ↳ {{ g.node.merchantName ?? g.node.description }}
                    <v-icon size="x-small" class="ml-1 text-medium-emphasis">mdi-chevron-right</v-icon>
                  </span>
                  <span>{{ formatMoney(g.node.amount) }}</span>
                </div>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="addChildOpen" max-width="500">
      <v-card>
        <v-card-title>Untertransaktion hinzufügen</v-card-title>
        <v-card-text>
          <v-text-field v-model="childForm.merchantName" label="Beschreibung" variant="outlined" />
          <v-text-field v-model="childForm.amount" label="Betrag (€)" variant="outlined" />
          <v-select v-model="childForm.categoryId" :items="categories" item-title="name" item-value="id" label="Kategorie" variant="outlined" clearable />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="addChildOpen = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="addChild">Hinzufügen</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.border-t {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
.tree-child-row {
  cursor: pointer;
  border-radius: 4px;
}
.tree-child-row:hover {
  background-color: rgba(0, 0, 0, 0.04);
}
</style>
