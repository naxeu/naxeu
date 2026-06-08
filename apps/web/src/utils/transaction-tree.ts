/** Flat transaction row from the API */
export interface TxFlat {
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
  /** DB-Transaktionsquelle (`import`, `manual`, `attachment`, …). */
  source?: string;
  /** Nur gesetzt, wenn ein Beleg direkt dieser Transaktion zugeordnet ist (nicht bei Konto-/Import-Wurzel). */
  receiptAttachment?: { id: string; mimeType: string } | null;
}

export interface TxTreeNode {
  tx: TxFlat;
  children: TxTreeNode[];
}

/** Ausgaben-Buchung, der man nachträglich einen Beleg zuordnen darf (keine reine Beleg-Shell). */
export function rootTransactionMayAttachReceipt(tx: TxFlat): boolean {
  const src = tx.source ?? "";
  return tx.type === "expense" && src !== "attachment";
}

/** Beleg vorhanden: direktes Attachment an dieser Zeile oder Beleg-Shell im Teilbaum. */
export function treeNodeHasLinkedReceipt(node: TxTreeNode): boolean {
  if (node.tx.receiptAttachment) return true;
  for (const ch of node.children) {
    if (ch.tx.source === "attachment") return true;
    if (treeNodeHasLinkedReceipt(ch)) return true;
  }
  return false;
}

function byDateDesc(a: TxFlat, b: TxFlat): number {
  if (a.date < b.date) return 1;
  if (a.date > b.date) return -1;
  return 0;
}

/**
 * Builds a forest of roots (no parent in list or parentId null) with nested children.
 */
export function buildTransactionForest(flat: TxFlat[]): TxTreeNode[] {
  const idSet = new Set(flat.map((t) => t.id));
  const byParent = new Map<string, TxFlat[]>();
  for (const t of flat) {
    if (!t.parentId || !idSet.has(t.parentId)) continue;
    const list = byParent.get(t.parentId);
    if (list) list.push(t);
    else byParent.set(t.parentId, [t]);
  }
  for (const list of byParent.values()) list.sort(byDateDesc);

  function wrap(tx: TxFlat): TxTreeNode {
    const raw = byParent.get(tx.id) ?? [];
    return { tx, children: raw.map(wrap) };
  }

  const roots = flat.filter((t) => !t.parentId || !idSet.has(t.parentId));
  roots.sort(byDateDesc);
  return roots.map(wrap);
}
