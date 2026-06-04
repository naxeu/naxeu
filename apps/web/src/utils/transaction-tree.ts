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
}

export interface TxTreeNode {
  tx: TxFlat;
  children: TxTreeNode[];
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
