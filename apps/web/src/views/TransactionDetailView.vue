<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "@/api/client";
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
  date: string;
  parentId: string | null;
  affectsBudget: boolean;
  affectsAccountBalance: boolean;
}
interface TreeNode { node: Tx; children: TreeNode[] }
interface Category { id: string; name: string }

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;

const tx = ref<Tx | null>(null);
const tree = ref<TreeNode | null>(null);
const categories = ref<Category[]>([]);
const addChildOpen = ref(false);
const childForm = ref({ amount: "", merchantName: "", categoryId: null as string | null, type: "item" });
const error = ref("");

const catName = (cid: string | null) => categories.value.find((c) => c.id === cid)?.name ?? "–";

async function load(): Promise<void> {
  const [t, tr, c] = await Promise.all([
    api<{ transaction: Tx }>(`/transactions/${id}`),
    api<{ tree: TreeNode }>(`/transactions/${id}/tree`),
    api<{ categories: Category[] }>("/categories"),
  ]);
  tx.value = t.transaction;
  tree.value = tr.tree;
  categories.value = c.categories;
}

async function addChild(): Promise<void> {
  error.value = "";
  try {
    await api(`/transactions/${id}/children`, {
      method: "POST",
      body: {
        type: childForm.value.type,
        amount: childForm.value.amount,
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
  await api(`/transactions/${id}`, { method: "DELETE" });
  await router.push({ name: "transactions" });
}

onMounted(load);
</script>

<template>
  <div v-if="tx">
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" to="/transactions" />
      <h1 class="text-h4 font-weight-bold ml-2">{{ tx.merchantName ?? "Transaktion" }}</h1>
      <v-spacer />
      <v-btn color="error" variant="text" prepend-icon="mdi-delete" @click="remove">Löschen</v-btn>
    </div>
    <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>

    <v-row>
      <v-col cols="12" md="5">
        <v-card rounded="lg" border>
          <v-card-title>Details</v-card-title>
          <v-list density="compact">
            <v-list-item title="Betrag" :subtitle="formatMoney(tx.amount)" />
            <v-list-item title="Datum" :subtitle="formatDate(tx.date)" />
            <v-list-item title="Typ" :subtitle="tx.type" />
            <v-list-item title="Kategorie" :subtitle="catName(tx.categoryId)" />
            <v-list-item title="Beschreibung" :subtitle="tx.description ?? '–'" />
            <v-list-item>
              <template #title>Status</template>
              <template #subtitle><v-chip :color="statusColor[tx.status]" size="small">{{ tx.status }}</v-chip></template>
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
                <div class="d-flex justify-space-between py-1 border-t">
                  <span>↳ {{ child.node.merchantName ?? child.node.description }} <small class="text-medium-emphasis">({{ catName(child.node.categoryId) }})</small></span>
                  <span>{{ formatMoney(child.node.amount) }}</span>
                </div>
                <div v-for="g in child.children" :key="g.node.id" class="ml-8 d-flex justify-space-between py-1">
                  <span>↳ {{ g.node.merchantName ?? g.node.description }}</span>
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
.border-t { border-top: 1px solid rgba(0, 0, 0, 0.06); }
</style>
