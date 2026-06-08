<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import type { TxTreeNode } from "@/utils/transaction-tree";
import { rootTransactionMayAttachReceipt, treeNodeHasLinkedReceipt } from "@/utils/transaction-tree";
import { formatDate, formatMoney, statusColor } from "@/utils/format";
import AttachmentThumbnail from "@/components/AttachmentThumbnail.vue";

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

const router = useRouter();

const expanded = ref(false);
const hasChildren = computed(() => props.node.children.length > 0);
const childVisible = computed(() => props.visible && expanded.value);

const showAddReceipt = computed(
  () =>
    props.depth === 0 &&
    rootTransactionMayAttachReceipt(props.node.tx) &&
    !treeNodeHasLinkedReceipt(props.node),
);

function toggle(): void {
  expanded.value = !expanded.value;
}

function onRowClick(): void {
  emit("open", props.node.tx.id);
}

function forwardOpen(id: string): void {
  emit("open", id);
}

function goAddReceipt(ev: MouseEvent): void {
  ev.stopPropagation();
  void router.push({ name: "attachments", query: { forTransaction: props.node.tx.id } });
}
</script>

<template>
  <template v-if="visible">
    <tr class="tx-tree-row" @click="onRowClick">
      <td class="text-body-2 text-medium-emphasis">{{ formatDate(node.tx.date) }}</td>
      <td class="text-body-2">
        <div class="d-flex align-center flex-grow-1 min-width-0" :style="{ paddingLeft: `${depth * 20}px` }">
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
          <div v-if="node.tx.receiptAttachment" class="flex-shrink-0 mr-2 nx-tx-thumb-wrap" @click.stop>
            <AttachmentThumbnail
              :attachment-id="node.tx.receiptAttachment.id"
              :mime-type="node.tx.receiptAttachment.mimeType"
              variant="list"
            />
          </div>
          <span class="text-truncate min-width-0">{{ node.tx.merchantName ?? node.tx.description ?? "–" }}</span>
        </div>
      </td>
      <td class="text-body-2">{{ catName(node.tx.categoryId) }}</td>
      <td>
        <v-chip :color="statusColor[node.tx.status] ?? 'grey'" size="small">{{ node.tx.status }}</v-chip>
      </td>
      <td class="text-end text-body-2 py-1" style="width: 9.5rem; vertical-align: middle" @click.stop>
        <v-btn
          v-if="showAddReceipt"
          size="x-small"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-paperclip"
          class="text-none"
          @click="goAddReceipt"
        >
          Beleg hinzufügen
        </v-btn>
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
.nx-tx-thumb-wrap {
  width: 52px;
  max-height: 52px;
  overflow: hidden;
  border-radius: 6px;
}
</style>
