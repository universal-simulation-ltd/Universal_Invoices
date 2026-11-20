import { beforeEach, describe, expect, it } from 'vitest';
import {
  INVOICES_SETTINGS_DEFAULTS,
  migrateLegacyPrefs,
  migratedFlag,
  normaliseInvoicesSettings,
  pickLegacySettings,
  readLegacyInvoicesSettings,
  STAMP_KEY,
  useInvoicesSettings,
  type MigrationIo,
} from './invoicesSettings';

function memoryStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), map: m };
}

function fakeIo(rows: Record<string, unknown>, seed: Record<string, string> = {}) {
  const storage = memoryStorage(seed);
  const writes: { app: string; data: unknown }[] = [];
  const reads: string[] = [];
  const io: MigrationIo = {
    read: async (app) => {
      reads.push(app);
      return { data: app in rows ? { data: rows[app] } : null, error: null };
    },
    write: async (app, data) => { writes.push({ app, data }); rows[app] = data; },
    storage,
    now: () => 1_000,
  };
  return { io, storage, writes, reads };
}

describe('normaliseInvoicesSettings', () => {
  it('fills in the defaults: the app’s own tab order, Hide invoices off', () => {
    expect(normaliseInvoicesSettings(undefined)).toEqual(INVOICES_SETTINGS_DEFAULTS);
    expect(normaliseInvoicesSettings('junk')).toEqual({ tabOrder: null, hideInvoices: false });
    expect(INVOICES_SETTINGS_DEFAULTS.hideInvoices).toBe(false);
  });
  it('makes a stored order whole and keeps only a real true', () => {
    expect(normaliseInvoicesSettings({ tabOrder: ['clients', 'nope', 'clients'], hideInvoices: 'yes' })).toEqual({
      tabOrder: ['clients', 'companies', 'documents', 'catalogue'],
      hideInvoices: false,
    });
    expect(normaliseInvoicesSettings({ hideInvoices: true }).hideInvoices).toBe(true);
  });
});

describe('the old useUserPrefs bag', () => {
  it('gives the two settings and nothing else', () => {
    expect(pickLegacySettings({ tabOrder: ['catalogue'], hideInvoices: true, activeCompany: 'c1' })).toEqual({ tabOrder: ['catalogue'], hideInvoices: true });
    expect(pickLegacySettings({ activeCompany: 'c1', tabOrder: null })).toBeUndefined();
    expect(pickLegacySettings(null)).toBeUndefined();
  });
  it('is read from unisim:prefs:invoices; corrupt reads as nothing', () => {
    expect(readLegacyInvoicesSettings(memoryStorage({ 'unisim:prefs:invoices': '{"hideInvoices":true}' }))).toEqual({ hideInvoices: true });
    expect(readLegacyInvoicesSettings(memoryStorage({ 'unisim:prefs:invoices': '{' }))).toBeUndefined();
    expect(readLegacyInvoicesSettings(memoryStorage())).toBeUndefined();
  });
});

describe('migrateLegacyPrefs (the account’s old row, once)', () => {
  beforeEach(() => useInvoicesSettings.reset());

  it('a brand-new device: adopts the old row and writes it to the new row, stamped', async () => {
    const { io, storage, writes } = fakeIo({ invoices: { tabOrder: ['catalogue', 'clients'], hideInvoices: true, activeCompany: 'c1' } });
    expect(await migrateLegacyPrefs('u1', io)).toBe('adopted');
    expect(useInvoicesSettings.getState()).toEqual({ tabOrder: ['catalogue', 'clients', 'companies', 'documents'], hideInvoices: true });
    // The values changed here, so the SDK's own change sends them; the stamp is this account's.
    expect(JSON.parse(storage.getItem(STAMP_KEY)!).uid).toBe('u1');
    expect(writes).toEqual([]);
    expect(storage.getItem(migratedFlag('u1'))).toBe('1');
  });

  it('a device that already had them: nothing changes here, so it writes the row itself', async () => {
    useInvoicesSettings.set({ hideInvoices: true });
    const { io, storage, writes } = fakeIo({ invoices: { hideInvoices: true } });
    expect(await migrateLegacyPrefs('u1', io)).toBe('adopted');
    expect(writes).toEqual([{ app: 'tune-app:invoices', data: { at: 1_000, values: { tabOrder: null, hideInvoices: true } } }]);
    expect(JSON.parse(storage.getItem(STAMP_KEY)!)).toEqual({ at: 1_000, uid: 'u1' });
  });

  it('the new row has a set: the account has moved, the old row is not read', async () => {
    const { io, reads, writes } = fakeIo({ 'tune-app:invoices': { at: 5, values: { hideInvoices: false } }, invoices: { hideInvoices: true } });
    expect(await migrateLegacyPrefs('u1', io)).toBe('moved');
    expect(reads).toEqual(['tune-app:invoices']);
    expect(writes).toEqual([]);
    expect(useInvoicesSettings.getState().hideInvoices).toBe(false);
  });

  it('once done on this device, reads nothing at all', async () => {
    const { io, reads } = fakeIo({ invoices: { hideInvoices: true } }, { [migratedFlag('u1')]: '1' });
    expect(await migrateLegacyPrefs('u1', io)).toBe('moved');
    expect(reads).toEqual([]);
  });

  it('nothing in the old row: nothing to adopt', async () => {
    const { io, storage, writes } = fakeIo({ invoices: { activeCompany: 'c1' } });
    expect(await migrateLegacyPrefs('u1', io)).toBe('nothing');
    expect(writes).toEqual([]);
    expect(storage.getItem(STAMP_KEY)).toBeNull();
  });

  it('this device changed a setting since the move: its own set is newer', async () => {
    const { io, writes } = fakeIo({ invoices: { hideInvoices: true } }, { [STAMP_KEY]: JSON.stringify({ at: 9, uid: 'u1' }) });
    expect(await migrateLegacyPrefs('u1', io)).toBe('device-newer');
    expect(writes).toEqual([]);
    expect(useInvoicesSettings.getState().hideInvoices).toBe(false);
  });

  it('another account’s stamp on a shared device is no stamp: adopted', async () => {
    const { io } = fakeIo({ invoices: { hideInvoices: true } }, { [STAMP_KEY]: JSON.stringify({ at: 9, uid: 'someone-else' }) });
    expect(await migrateLegacyPrefs('u1', io)).toBe('adopted');
    expect(useInvoicesSettings.getState().hideInvoices).toBe(true);
  });

  it('a failed read leaves it to try again', async () => {
    const { io, storage } = fakeIo({});
    io.read = async () => ({ data: null, error: new Error('offline') });
    expect(await migrateLegacyPrefs('u1', io)).toBe('failed');
    expect(storage.getItem(migratedFlag('u1'))).toBeNull();
  });
});
