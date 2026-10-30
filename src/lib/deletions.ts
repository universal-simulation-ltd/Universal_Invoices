// What this browser has deleted, so the online backup can carry deletions to
// other devices (lib/cloud.ts). In localStorage: small, and losing it costs
// only a deleted row reappearing from the copy — never data.

import { pruneTombstones, type Table, type Tombstone } from './cloud';

const KEY = 'universal-invoices:deleted';

export function readTombstones(): Tombstone[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? (v as Tombstone[]).filter((t) => t && typeof t.id === 'string' && typeof t.at === 'number') : [];
  } catch {
    return [];
  }
}

export function writeTombstones(list: Tombstone[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pruneTombstones(list)));
  } catch {
    /* storage blocked — see the header */
  }
}

export function recordDeleted(table: Table, ids: string[], now = Date.now()) {
  if (!ids.length) return;
  writeTombstones([...readTombstones(), ...ids.map((id) => ({ table, id, at: now }))]);
}
