import { describe, expect, it } from 'vitest';
import type { Dataset } from './backup';
import { formatBytes, mergeCloud, pack, pruneTombstones, unpack, type CloudPayload } from './cloud';
import type { Client } from './types';

const client = (id: string, updatedAt: number, name = id): Client => ({ id, name, address: [], reference: '', email: '', updatedAt });
const data = (clients: Client[]): Dataset => ({ companies: [], clients, products: [], documents: [] });
const copy = (clients: Client[], deleted: CloudPayload['deleted'] = []): CloudPayload => ({ app: 'universal-invoices', version: 1, savedAt: 0, ...data(clients), deleted });

describe('online backup', () => {
  it('packs to text and back', () => {
    const text = pack(data([client('a', 1, 'Acme — Société')]), [{ table: 'clients', id: 'x', at: Date.now() }]);
    expect(typeof text).toBe('string');
    const back = unpack(text);
    expect(back.clients[0].name).toBe('Acme — Société');
    expect(back.deleted).toHaveLength(1);
  });
  it('a new device takes everything from the copy', () => {
    const m = mergeCloud(data([]), [], copy([client('a', 1), client('b', 2)]));
    expect(m.write.clients.map((c) => c.id)).toEqual(['a', 'b']);
    expect(m.localAhead).toBe(false);
  });
  it('the newer edit wins either way, and says when this device is ahead', () => {
    const m = mergeCloud(data([client('a', 5, 'mine'), client('b', 1, 'old')]), [], copy([client('a', 3, 'theirs'), client('b', 9, 'new')]));
    expect(m.write.clients).toEqual([client('b', 9, 'new')]);
    expect(m.localAhead).toBe(true);
  });
  it('a deletion elsewhere removes the row here', () => {
    const now = Date.now();
    const m = mergeCloud(data([client('a', now - 1000)]), [], copy([], [{ table: 'clients', id: 'a', at: now }]));
    expect(m.remove.clients).toEqual(['a']);
  });
  it('a deletion here keeps the copy’s row out', () => {
    const now = Date.now();
    const m = mergeCloud(data([]), [{ table: 'clients', id: 'a', at: now }], copy([client('a', now - 1000)]));
    expect(m.write.clients).toEqual([]);
    expect(m.localAhead).toBe(true); // the copy still has it: upload
  });
  it('an edit after the deletion wins — never lose work', () => {
    const now = Date.now();
    const m = mergeCloud(data([client('a', now + 1000, 'edited')]), [], copy([], [{ table: 'clients', id: 'a', at: now }]));
    expect(m.remove.clients).toEqual([]);
  });
  it('examples never travel', () => {
    const m = mergeCloud(data([{ ...client('ex', 1), example: true }]), [], copy([{ ...client('ex2', 1), example: true }]));
    expect(m.write.clients).toEqual([]);
    expect(m.localAhead).toBe(false);
  });
  it('old and duplicate tombstones are pruned', () => {
    const now = Date.now();
    const list = pruneTombstones([
      { table: 'clients', id: 'a', at: now - 200 * 86400000 },
      { table: 'clients', id: 'b', at: now - 10 },
      { table: 'clients', id: 'b', at: now },
    ], now);
    expect(list).toEqual([{ table: 'clients', id: 'b', at: now }]);
  });
  it('sizes read as people say them', () => {
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
    expect(formatBytes(1.25 * 1024 * 1024)).toBe('1.3 MB');
    expect(formatBytes(2048)).toBe('2 KB');
  });
});
