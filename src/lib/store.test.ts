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
