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
 * Move a row (a product or a folder) — or several products at once, the
 * ticked ones (James, 2026-10-31: "when selected multiple items and then
 * dragging one, drag them all into the folder they get dropped into") — to
 * `target`. Several keep the order they had, wherever they came from. Returns
 * only the rows whose place changed, renumbered 0, 1, 2… in the levels it
 * touched — or nothing, when they land where they already were. A folder only
 * moves at the top, and alone: folders do not nest.
 */
export function move(
  products: Product[],
  folders: Folder[],
  ids: string | string[],
  target: Target,
): { products: Product[]; folders: Folder[] } {
  const none = { products: [], folders: [] };
  const top = arrange(products, folders);
  const asked = new Set(typeof ids === 'string' ? [ids] : ids);
  const folderIds = new Set(folders.map((f) => f.id));
  const movingFolder = [...asked].some((id) => folderIds.has(id));
  if (movingFolder && (asked.size > 1 || target.parent !== null)) return none;
  if (target.parent !== null && !folderIds.has(target.parent)) return none;

  // The levels as lists of ids, in the order they show.
  const levels = new Map<string | null, string[]>([[null, top.map(entryId)]]);
  for (const e of top) if (e.kind === 'folder') levels.set(e.folder.id, e.items.map((p) => p.id));
  const moving = movingFolder ? [...asked] : flatten(top).map((p) => p.id).filter((id) => asked.has(id));
  if (!moving.length) return none;

  // Dropped on one of the moving rows: land before the next row that stays.
  const into = levels.get(target.parent)!;
  let before = target.before;
  if (before !== null && asked.has(before)) {
    const rest = into.slice(into.indexOf(before));
    before = rest.find((id) => !asked.has(id)) ?? null;
  }

  // Out of wherever they are, then in at the landing place.
  const touched = new Set<string | null>([target.parent]);
  for (const [parent, list] of levels) {
    const kept = list.filter((id) => !asked.has(id));
    if (kept.length !== list.length) {
      touched.add(parent);
      levels.set(parent, kept);
    }
  }
  const landing = levels.get(target.parent)!;
  const at = before === null ? landing.length : landing.indexOf(before);
  landing.splice(at < 0 ? landing.length : at, 0, ...moving);

  // Renumber the levels touched; keep only rows that changed.
  const out = { products: [] as Product[], folders: [] as Folder[] };
  const rows = new Map<string, Product | Folder>([...products, ...folders].map((r) => [r.id, r]));
  for (const parent of touched) {
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
