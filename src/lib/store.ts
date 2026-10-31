// IndexedDB persistence. Five object stores, one record per row, keyed by
// `id`. No dependency — the same 40-line wrapper PalsPayIn uses, because the
// app's whole pitch is being small and local.

import type { Client, Company, Folder, InvoiceDoc, Product } from './types';

const DB_NAME = 'universal-invoices';
// 2: `folders` (the catalogue's, 2026-10-31). onupgradeneeded only adds what is missing.
const DB_VERSION = 2;

export const TABLES = ['companies', 'clients', 'products', 'folders', 'documents'] as const;
export type Table = (typeof TABLES)[number];

export interface Rows {
  companies: Company;
  clients: Client;
  products: Product;
  folders: Folder;
  documents: InvoiceDoc;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const name of TABLES) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(table: Table | Table[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(table, mode);
      const req = fn(t);
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function loadAll(): Promise<{ [K in Table]: Rows[K][] }> {
  const out = {} as { [K in Table]: Rows[K][] };
  for (const table of TABLES) {
    const rows = await run(table, 'readonly', (t) => t.objectStore(table).getAll());
    (out as Record<Table, unknown[]>)[table] = (rows as unknown[]) ?? [];
  }
  return out;
}

export async function put<K extends Table>(table: K, row: Rows[K]): Promise<void> {
  await run(table, 'readwrite', (t) => t.objectStore(table).put(row));
}

/** Several rows in one transaction — a new document AND its company's advanced counter. */
export async function putMany(rows: { [K in Table]?: Rows[K][] }): Promise<void> {
  const tables = TABLES.filter((t) => rows[t]?.length);
  if (!tables.length) return;
  await run(tables, 'readwrite', (t) => {
    for (const table of tables) for (const row of rows[table]!) t.objectStore(table).put(row);
  });
}

export async function remove(table: Table, id: string): Promise<void> {
  await run(table, 'readwrite', (t) => t.objectStore(table).delete(id));
}

/** Several rows of one table, in one transaction — "Delete selected". */
export async function removeMany(table: Table, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await run(table, 'readwrite', (t) => {
    const store = t.objectStore(table);
    for (const id of ids) store.delete(id);
  });
}
