<script setup lang="ts">
import { computed, ref } from "vue";
import type { TxTreeNode } from "@/utils/transaction-tree";
import { formatDate, formatMoney, statusColor } from "@/utils/format";

defineOptions({ name: "TransactionTreeRow" });

const props = withDefaults(
  defineProps<{
    node: TxTreeNode;
    depth: number;
    /** False when an ancestor row is collapsed */
    visible: boolean;
    catName: (id: string | null) => string;
  }>(),
  { depth: 0, visible: true },
);

const emit = defineEmits<{ open: [id: string] }>();

const expanded = ref(false);
const hasChildren = computed(() => props.node.children.length > 0);
const childVisible = computed(() => props.visible && expanded.value);

function toggle(): void {
  expanded.value = !expanded.value;
}

function onRowClick(): void {
  emit("open", props.node.tx.id);
}

function forwardOpen(id: string): void {
  emit("open", id);
}
</script>

<template>
  <template v-if="visible">
    <tr class="tx-tree-row" @click="onRowClick">
      <td class="text-body-2 text-medium-emphasis">{{ formatDate(node.tx.date) }}</td>
      <td class="text-body-2">
        <div class="d-flex align-center" :style="{ paddingLeft: `${depth * 20}px` }">
          <v-btn
            v-if="hasChildren"
            icon
            variant="text"
            size="x-small"
            class="mr-1 flex-shrink-0"
            :aria-expanded="expanded ? 'true' : 'false'"
            @click.stop="toggle"
          >
            <v-icon size="small">{{ expanded ? "mdi-chevron-down" : "mdi-chevron-right" }}</v-icon>
          </v-btn>
          <span v-else class="tx-tree-leaf-spacer mr-1 flex-shrink-0" />
          <span class="text-truncate">{{ node.tx.merchantName ?? node.tx.description ?? "–" }}</span>
        </div>
      </td>
      <td class="text-body-2">{{ catName(node.tx.categoryId) }}</td>
      <td>
        <v-chip :color="statusColor[node.tx.status] ?? 'grey'" size="small">{{ node.tx.status }}</v-chip>
      </td>
      <td class="text-end text-body-2">
        <span :class="Number(node.tx.amount) >= 0 ? 'text-success' : 'text-error'">{{ formatMoney(node.tx.amount) }}</span>
      </td>
    </tr>
    <TransactionTreeRow
      v-for="ch in node.children"
      :key="ch.tx.id"
      :node="ch"
      :depth="depth + 1"
      :visible="childVisible"
      :cat-name="catName"
      @open="forwardOpen"
    />
  </template>
</template>

<style scoped>
.tx-tree-row {
  cursor: pointer;
}
.tx-tree-row:hover {
  background-color: rgba(0, 0, 0, 0.04);
}
.tx-tree-leaf-spacer {
  display: inline-block;
  width: 28px;
  height: 28px;
  vertical-align: middle;
}
</style>
