// The online backup (James, 2026-10-30: "if signed in backup data online to
// account (reasonable limit unless enterprise)"). One row per Universal ID in
// the platform's `app_backups` (migration 0320): the whole dataset as gzip'd
// JSON, base64. The app still works from IndexedDB; the row is a copy, and a
// second device signed in to the same ID merges it in.
//
// Merging is the backup file's rule (newest `updatedAt` wins per row) plus
// DELETIONS: without them a quote deleted on the laptop would come straight
// back from the copy the phone uploaded. Each device remembers what it
// deleted (a tombstone: table, id, when) and the copy carries them, so a
// deletion reaches every device — unless the row was edited after it.
//
// Pure (fflate for gzip), so the tests run it in Node.

import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { Dataset } from './backup';

export const CLOUD_PRODUCT = 'invoices';
export const CLOUD_TABLE = 'app_backups';
const PAYLOAD_VERSION = 1;
/** Tombstones older than this are dropped: every device has long since synced. */
const TOMBSTONE_DAYS = 120;

export type Table = keyof Dataset;
export interface Tombstone {
  table: Table;
  id: string;
  /** Epoch ms. */
  at: number;
}

export interface CloudPayload extends Dataset {
  app: 'universal-invoices';
  version: number;
  savedAt: number;
  deleted: Tombstone[];
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** The text stored in the row. Its length is what the 10 MB limit counts. */
export function pack(data: Dataset, deleted: Tombstone[], now = Date.now()): string {
  const payload: CloudPayload = { app: 'universal-invoices', version: PAYLOAD_VERSION, savedAt: now, ...data, deleted: pruneTombstones(deleted, now) };
  return toBase64(gzipSync(strToU8(JSON.stringify(payload)), { level: 6 }));
}

export function unpack(text: string): CloudPayload {
  const payload = JSON.parse(strFromU8(gunzipSync(fromBase64(text)))) as Partial<CloudPayload>;
  if (payload.app !== 'universal-invoices') throw new Error('The online backup is not a Universal Invoices one.');
  if (typeof payload.version !== 'number' || payload.version > PAYLOAD_VERSION) {
    throw new Error('The online backup was made by a newer version of Universal Invoices. Reload the page to update.');
  }
  return {
    app: 'universal-invoices',
    version: payload.version,
    savedAt: payload.savedAt ?? 0,
    companies: payload.companies ?? [],
    clients: payload.clients ?? [],
    products: payload.products ?? [],
    documents: payload.documents ?? [],
    deleted: payload.deleted ?? [],
  };
}

export function pruneTombstones(list: Tombstone[], now = Date.now()): Tombstone[] {
  const cutoff = now - TOMBSTONE_DAYS * 86400000;
  const latest = new Map<string, Tombstone>();
  for (const t of list) {
    if (t.at < cutoff) continue;
    const key = `${t.table}:${t.id}`;
    const have = latest.get(key);
    if (!have || t.at > have.at) latest.set(key, t);
  }
  return [...latest.values()];
}

export interface CloudMerge {
  /** Rows to write locally: new from the copy, or newer there. */
  write: Dataset;
  /** Local rows a deletion elsewhere removes. */
  remove: { [K in Table]: string[] };
  /** Both sides' tombstones, for the next upload. */
  deleted: Tombstone[];
  /** Whether the local data differs from the copy afterwards — i.e. an upload is due. */
  localAhead: boolean;
}

/**
 * Merge the online copy into this device's data. Never loses an edit: a row
 * changed after it was deleted elsewhere stays (and the deletion is dropped).
 */
export function mergeCloud(local: Dataset, localDeleted: Tombstone[], remote: CloudPayload): CloudMerge {
  const deleted = pruneTombstones([...localDeleted, ...remote.deleted]);
  const tomb = new Map(deleted.map((t) => [`${t.table}:${t.id}`, t.at]));
  const write: Dataset = { companies: [], clients: [], products: [], documents: [] };
  const remove = { companies: [], clients: [], products: [], documents: [] } as CloudMerge['remove'];
  let localAhead = false;

  const tables: Table[] = ['companies', 'clients', 'products', 'documents'];
  for (const table of tables) {
    const mine = new Map((local[table] as { id: string; updatedAt: number; example?: boolean }[]).map((r) => [r.id, r]));
    const theirs = new Map((remote[table] as { id: string; updatedAt: number; example?: boolean }[]).map((r) => [r.id, r]));
    for (const [id, row] of theirs) {
      if (row.example) continue;
      const gone = tomb.get(`${table}:${id}`);
      if (gone !== undefined && gone >= (row.updatedAt ?? 0)) continue;
      const have = mine.get(id);
      if (!have || (row.updatedAt ?? 0) > (have.updatedAt ?? 0)) (write[table] as unknown[]).push(row);
      else if ((have.updatedAt ?? 0) > (row.updatedAt ?? 0)) localAhead = true;
    }
    for (const [id, row] of mine) {
      if (row.example) continue;
      const gone = tomb.get(`${table}:${id}`);
      if (gone !== undefined && gone >= (row.updatedAt ?? 0)) {
        remove[table].push(id);
        continue;
      }
      if (!theirs.has(id)) localAhead = true;
    }
  }
  if (deleted.length !== remote.deleted.length) localAhead = true;
  return { write, remove, deleted, localAhead };
}

/** "1.2 MB", "340 KB". */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
