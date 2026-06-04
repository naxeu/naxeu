<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/api/client";

interface Category { id: string; name: string; type: string }
interface Account { id: string; name: string }

const router = useRouter();

const quick = ref("");
const parsing = ref(false);
const saving = ref(false);
const error = ref("");
const parsedNote = ref("");

const categories = ref<Category[]>([]);
const accounts = ref<Account[]>([]);

const form = ref({
  type: "expense",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  merchantName: "",
  description: "",
  categoryId: null as string | null,
  accountId: null as string | null,
  counterAccountId: null as string | null,
  status: "confirmed",
});

const types = ["income", "expense", "transfer", "refund"];
const isTransfer = computed(() => form.value.type === "transfer");

onMounted(async () => {
  const [c, a] = await Promise.all([
    api<{ categories: Category[] }>("/categories"),
    api<{ accounts: Account[] }>("/accounts"),
  ]);
  categories.value = c.categories.filter((x) => !("isArchived" in x) || true);
  accounts.value = a.accounts;
});

async function parse(): Promise<void> {
  if (!quick.value.trim()) return;
  parsing.value = true;
  error.value = "";
  try {
    const res = await api<{
      parsed: { merchantName: string | null; amount: string; type: string; description: string | null; categoryHint: string | null; confidence: number };
      categoryId: string | null;
    }>("/ai/parse-quick-input", { method: "POST", body: { input: quick.value } });
    form.value.type = res.parsed.type;
    form.value.amount = res.parsed.amount;
    form.value.merchantName = res.parsed.merchantName ?? "";
    form.value.description = res.parsed.description ?? quick.value;
    form.value.categoryId = res.categoryId;
    parsedNote.value = `Erkannt: ${res.parsed.type}, ${res.parsed.amount} € (Konfidenz ${(res.parsed.confidence * 100).toFixed(0)}%${res.parsed.categoryHint ? ", Kategorie " + res.parsed.categoryHint : ""})`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Parsing fehlgeschlagen";
  } finally {
    parsing.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = "";
  try {
    await api("/transactions", {
      method: "POST",
      body: {
        type: form.value.type,
        amount: form.value.amount,
        date: form.value.date,
        merchantName: form.value.merchantName || null,
        description: form.value.description || null,
        // Transfers carry no budget category; they only move money.
        categoryId: isTransfer.value ? null : form.value.categoryId,
        accountId: form.value.accountId,
        counterAccountId: isTransfer.value ? form.value.counterAccountId : null,
        status: form.value.status,
      },
    });
    await router.push({ name: "transactions" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Speichern fehlgeschlagen";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-4">Transaktion erfassen</h1>
    <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>

    <v-card rounded="lg" border class="mb-4">
      <v-card-title>Schnelleingabe</v-card-title>
      <v-card-text>
        <p class="text-medium-emphasis mb-2">
          Z. B. <code>despar 84,30 karte</code>, <code>zooplus 42,90 katzenfutter</code>,
          <code>+3250 gehalt</code>, <code>amazon 12,99 haushalt</code>
        </p>
        <div class="d-flex ga-2">
          <v-text-field
            v-model="quick"
            label="Schnelleingabe"
            variant="outlined"
            hide-details
            density="comfortable"
            @keyup.enter="parse"
          />
          <v-btn color="primary" :loading="parsing" size="large" @click="parse">Analysieren</v-btn>
        </div>
        <v-alert v-if="parsedNote" type="success" variant="tonal" density="compact" class="mt-3">
          {{ parsedNote }}
        </v-alert>
      </v-card-text>
    </v-card>

    <v-card rounded="lg" border>
      <v-card-title>Details</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" sm="6">
            <v-select v-model="form.type" :items="types" label="Typ" variant="outlined" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.amount" label="Betrag (€)" variant="outlined" type="text" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.date" label="Datum" type="date" variant="outlined" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.merchantName" label="Händler" variant="outlined" />
          </v-col>
          <v-col v-if="!isTransfer" cols="12" sm="6">
            <v-select
              v-model="form.categoryId"
              :items="categories"
              item-title="name"
              item-value="id"
              label="Kategorie"
              variant="outlined"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.accountId"
              :items="accounts"
              item-title="name"
              item-value="id"
              :label="isTransfer ? 'Von Konto' : 'Konto'"
              variant="outlined"
              clearable
            />
          </v-col>
          <v-col v-if="isTransfer" cols="12" sm="6">
            <v-select
              v-model="form.counterAccountId"
              :items="accounts"
              item-title="name"
              item-value="id"
              label="Auf Konto (Gegenkonto)"
              variant="outlined"
              clearable
            />
          </v-col>
          <v-col v-if="isTransfer" cols="12">
            <v-alert type="info" variant="tonal" density="compact">
              Umbuchung: beeinflusst die Kontostände, zählt aber nicht erneut fürs Budget
              (z. B. Ausgleich einer Kreditkartenabrechnung vom Bankkonto).
            </v-alert>
          </v-col>
          <v-col cols="12">
            <v-text-field v-model="form.description" label="Beschreibung" variant="outlined" />
          </v-col>
        </v-row>
        <v-btn color="primary" size="large" :loading="saving" prepend-icon="mdi-content-save" @click="save">
          Speichern
        </v-btn>
      </v-card-text>
    </v-card>
  </div>
</template>
