// The catalogue's arrangement: folders and products in the order you dragged
// them into. One level — the top holds folders and loose products, a folder
// holds products. Each row carries its own `order` (and a product its
// `folderId`), so an arrangement syncs and backs up like any other edit:
// newest `updatedAt` wins per row.
//
// Never dragged = no `order`: those come after the placed ones — folders,
// then products by code, which is how the list looked before it could be
// arranged.
//
// Pure, so the tests run it in Node.

import type { Folder, Product } from './types';

export type Entry = { kind: 'folder'; folder: Folder; items: Product[] } | { kind: 'item'; product: Product };

/** Where a dragged row lands: in `parent` (a folder id, or null for the top), before `before` (null = at the end). */
export interface Target {
  parent: string | null;
  before: string | null;
}

const byOrder =
  <T>(key: (x: T) => string, order: (x: T) => number | undefined) =>
  (a: T, b: T) => {
    const x = order(a);
    const y = order(b);
    if (x !== undefined && y !== undefined) return x - y;
    if (x !== undefined) return -1;
    if (y !== undefined) return 1;
    return key(a).localeCompare(key(b));
  };

const productKey = (p: Product) => p.code || p.description;
// Not yet placed: folders before loose products, as a file manager does.
const entryKey = (e: Entry) => (e.kind === 'folder' ? `0${e.folder.name}` : `1${productKey(e.product)}`);
const entryOrder = (e: Entry) => (e.kind === 'folder' ? e.folder.order : e.product.order);
export const entryId = (e: Entry) => (e.kind === 'folder' ? e.folder.id : e.product.id);

/** The top level, in order, each folder with its products in order. */
export function arrange(products: Product[], folders: Folder[]): Entry[] {
  const known = new Set(folders.map((f) => f.id));
  const inside = new Map<string, Product[]>(folders.map((f) => [f.id, []]));
  const loose: Product[] = [];
  for (const p of products) {
    if (p.folderId && known.has(p.folderId)) inside.get(p.folderId)!.push(p);
    else loose.push(p);
  }
  const top: Entry[] = [
    ...folders.map((folder): Entry => ({ kind: 'folder', folder, items: inside.get(folder.id)!.sort(byOrder(productKey, (p) => p.order)) })),
    ...loose.map((product): Entry => ({ kind: 'item', product })),
  ];
  return top.sort(byOrder(entryKey, entryOrder));
}

/** Every product in the order the catalogue shows them — folder by folder. */
export function flatten(entries: Entry[]): Product[] {
  return entries.flatMap((e) => (e.kind === 'folder' ? e.items : [e.product]));
}

/**
 * Move one row (a product or a folder) to `target`. Returns only the rows
 * whose place changed, renumbered 0, 1, 2… in the levels it touched — or
 * nothing, when it lands where it already was. A folder only moves at the
 * top: folders do not nest.
 */
export function move(
  products: Product[],
  folders: Folder[],
  id: string,
  target: Target,
): { products: Product[]; folders: Folder[] } {
  const none = { products: [], folders: [] };
  const top = arrange(products, folders);
  const folder = folders.find((f) => f.id === id);
  const product = products.find((p) => p.id === id);
  if (!folder && !product) return none;
  if (folder && target.parent !== null) return none;
  if (target.parent !== null && !folders.some((f) => f.id === target.parent)) return none;
  if (target.before === id) return none;

  // The levels as lists of ids, then the dragged id taken out of its own.
  const levels = new Map<string | null, string[]>([[null, top.map(entryId)]]);
  for (const e of top) if (e.kind === 'folder') levels.set(e.folder.id, e.items.map((p) => p.id));
  let from: string | null = null;
  for (const [parent, ids] of levels) {
    const i = ids.indexOf(id);
    if (i >= 0) {
      from = parent;
      ids.splice(i, 1);
    }
  }
  const into = levels.get(target.parent)!;
  const at = target.before === null ? into.length : into.indexOf(target.before);
  into.splice(at < 0 ? into.length : at, 0, id);

  // Renumber the levels it left and joined; keep only rows that changed.
  const out = { products: [] as Product[], folders: [] as Folder[] };
  const folderIds = new Set(folders.map((f) => f.id));
  const rows = new Map<string, Product | Folder>([...products, ...folders].map((r) => [r.id, r]));
  for (const parent of new Set([from, target.parent])) {
    levels.get(parent)!.forEach((rowId, order) => {
      const row = rows.get(rowId)!;
      if (folderIds.has(rowId)) {
        const f = row as Folder;
        if (f.order !== order) out.folders.push({ ...f, order });
      } else {
        const p = row as Product;
        // A stale folderId (its folder deleted) is cleared once it is moved at the top.
        if (p.order !== order || p.folderId !== (parent ?? undefined)) {
          const next: Product = { ...p, order };
          if (parent) next.folderId = parent;
          else delete next.folderId;
          out.products.push(next);
        }
      }
    });
  }
  return out;
}

/**
 * The keyboard's move: one place up or down within its level. A product at
 * the edge of a folder steps out of it, above or below the folder.
 */
export function step(products: Product[], folders: Folder[], id: string, dir: -1 | 1): Target | null {
  const top = arrange(products, folders);
  const ids = top.map(entryId);
  const i = ids.indexOf(id);
  if (i >= 0) {
    if (dir < 0) return i === 0 ? null : { parent: null, before: ids[i - 1] };
    return i === ids.length - 1 ? null : { parent: null, before: ids[i + 2] ?? null };
  }
  for (const e of top) {
    if (e.kind !== 'folder') continue;
    const inner = e.items.map((p) => p.id);
    const j = inner.indexOf(id);
    if (j < 0) continue;
    if (dir < 0) return j === 0 ? { parent: null, before: e.folder.id } : { parent: e.folder.id, before: inner[j - 1] };
    if (j === inner.length - 1) return { parent: null, before: ids[ids.indexOf(e.folder.id) + 1] ?? null };
    return { parent: e.folder.id, before: inner[j + 2] ?? null };
  }
  return null;
}
