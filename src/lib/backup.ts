// Back up everything to one JSON file, and read it back. The only way data
// moves between devices in v1 — which is why restoring MERGES (newest
// `updatedAt` wins per row) rather than replacing: restoring the Mac's backup
// on the Windows box must not delete what was only ever made on Windows.

import type { Client, Company, InvoiceDoc, Product } from './types';

export const BACKUP_APP = 'universal-invoices';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  companies: Company[];
  clients: Client[];
  products: Product[];
  documents: InvoiceDoc[];
}

export type Dataset = Pick<Backup, 'companies' | 'clients' | 'products' | 'documents'>;

export function makeBackup(data: Dataset, now = new Date()): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), ...data };
}

export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not a Universal Invoices backup (it is not JSON).');
  }
  const b = raw as Partial<Backup>;
  if (!b || b.app !== BACKUP_APP) throw new Error('That file is not a Universal Invoices backup.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('That backup was made by a newer version of Universal Invoices. Reload the page to update, then try again.');
  }
  for (const key of ['companies', 'clients', 'products', 'documents'] as const) {
    if (!Array.isArray(b[key])) throw new Error(`That backup is damaged: "${key}" is missing.`);
  }
  return b as Backup;
}

/**
 * Merge `incoming` into `current`, row by row: a row only one side has is
 * kept; a row both have keeps the newer `updatedAt`. Returns the rows that
 * need writing and a count for the "Restored …" notice.
 */
export function mergeDataset(current: Dataset, incoming: Dataset): { write: Dataset; added: number; updated: number } {
  let added = 0;
  let updated = 0;
  const pick = <T extends { id: string; updatedAt: number }>(mine: T[], theirs: T[]): T[] => {
    const byId = new Map(mine.map((r) => [r.id, r]));
    const out: T[] = [];
    for (const row of theirs) {
      const have = byId.get(row.id);
      if (!have) {
        added++;
        out.push(row);
      } else if ((row.updatedAt ?? 0) > (have.updatedAt ?? 0)) {
        updated++;
        out.push(row);
      }
    }
    return out;
  };
  const write: Dataset = {
    companies: pick(current.companies, incoming.companies),
    clients: pick(current.clients, incoming.clients),
    products: pick(current.products, incoming.products),
    documents: pick(current.documents, incoming.documents),
  };
  return { write, added, updated };
}
