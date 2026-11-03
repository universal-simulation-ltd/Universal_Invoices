import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { exampleData } from './example';
import { recordDeleted, readTombstones } from './deletions';
import { loadAll, put, setScope } from './store';

describe('one database per account', () => {
  it('keeps each Universal ID’s rows, and signed out’s, apart', async () => {
    const { company } = exampleData();
    setScope('account-a');
    await put('companies', { ...company, name: 'A Ltd' });
    recordDeleted('clients', ['gone-in-a']);
    setScope('account-b');
    expect((await loadAll()).companies).toEqual([]);
    expect(readTombstones()).toEqual([]);
    setScope(null);
    expect((await loadAll()).companies).toEqual([]);
    expect((await loadAll('account-a')).companies.map((c) => c.name)).toEqual(['A Ltd']);
  });
});

describe('bringing companies back from before accounts were kept apart', () => {
  it('brings the ticked company, its documents and their client — nothing else', async () => {
    const { useAppStore } = await import('../stores/appStore');
    const { company, client, doc } = exampleData();
    const hrv = { ...company, id: 'hrv', name: 'HRV', example: false };
    const other = { ...company, id: 'tma', name: 'TMA', example: false };
    setScope(null);
    await put('companies', hrv);
    await put('companies', other);
    await put('clients', { ...client, example: false });
    await put('documents', { ...doc, example: false, companyId: 'hrv', clientId: client.id });
    await useAppStore.getState().init('account-c');
    expect(useAppStore.getState().companies).toEqual([]);
    await useAppStore.getState().bringIn(['hrv'], false);
    const s = useAppStore.getState();
    expect(s.companies.map((c) => c.name)).toEqual(['HRV']);
    expect(s.documents.map((d) => d.id)).toEqual([doc.id]);
    expect(s.clients.map((c) => c.id)).toEqual([client.id]);
    expect((await loadAll('account-c')).companies.map((c) => c.id)).toEqual(['hrv']);
  });
});
