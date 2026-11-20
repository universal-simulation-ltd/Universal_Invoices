import { createSyncedSettings, parseSettingsRow, settingsRowApp } from '@unisim/sdk';
import { normaliseOrder } from '../lib/tabs';
import type { Tab } from './appStore';

// Invoices' own rows in Tune this app, on the device and — signed in — on the
// account (James, 2026-10-30: "mobile app and web app settings in tune this
// app should be saved and synced to their account … Global rule").
//
// One SDK synced store (`createSyncedSettings`, @unisim/sdk 0.232.0): kept in
// localStorage under `unisim:settings:invoices`, and the SDK provider carries
// it to the account's `tune-app:invoices` row, newest change wins. A device
// that never changed anything says nothing and takes the account's set;
// signed out it stays on this device. Reset to defaults (the SDK's) puts it
// back and syncs that too.
//
// Before this, both lived in the SDK's useUserPrefs (the `invoices` row, and
// `unisim:prefs:invoices` on the device). Nobody loses them:
//   • on the device, `legacy` reads that bag once (unstamped: kept here, not
//     sent);
//   • on the account, LegacyPrefsMigration (below) adopts the old row's values
//     once, when the new row is still empty, and writes them to it stamped —
//     so a brand-new device signing in gets them from the new row.
//
// NOT in here (they stay in useUserPrefs): the active company, chosen in Your
// companies rather than Tune, and the French e-invoicing note's "Got it".
//
// ⚠️ Never change a default here: a device that never changed anything shows
// the defaults. Hide invoices starts unticked, like every switch in the suite.

export const PRODUCT = 'invoices';

export interface InvoicesSettings {
  /** Tune ▸ Tab order (or a drag along the bar). `null` = the app's own order. */
  tabOrder: Tab[] | null;
  /** Tune ▸ "Hide invoices" (shownKinds.ts). */
  hideInvoices: boolean;
}

export const INVOICES_SETTINGS_DEFAULTS: InvoicesSettings = {
  tabOrder: null,
  hideInvoices: false,
};

/** Anything (the stored set, the old prefs bag, the account's values) → a complete set. */
export function normaliseInvoicesSettings(raw: unknown): InvoicesSettings {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    tabOrder: Array.isArray(r.tabOrder) ? normaliseOrder(r.tabOrder) : null,
    hideInvoices: r.hideInvoices === true,
  };
}

/** The keys these settings had in the useUserPrefs bag. */
const LEGACY_KEYS = ['tabOrder', 'hideInvoices'] as const;
/** useUserPrefs' device copy of the `invoices` row. */
export const LEGACY_PREFS_KEY = `unisim:prefs:${PRODUCT}`;

/** The two settings out of an old useUserPrefs bag, or `undefined` when it holds neither. */
export function pickLegacySettings(bag: unknown): Partial<InvoicesSettings> | undefined {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return undefined;
  const b = bag as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of LEGACY_KEYS) if (b[k] !== undefined && b[k] !== null) out[k] = b[k];
  return Object.keys(out).length ? (out as Partial<InvoicesSettings>) : undefined;
}

export function readLegacyInvoicesSettings(storage: Pick<Storage, 'getItem'>): Partial<InvoicesSettings> | undefined {
  try {
    const raw = storage.getItem(LEGACY_PREFS_KEY);
    return raw === null ? undefined : pickLegacySettings(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export const useInvoicesSettings = createSyncedSettings<InvoicesSettings>(
  PRODUCT,
  INVOICES_SETTINGS_DEFAULTS,
  (raw) => normaliseInvoicesSettings(raw),
  { legacy: () => readLegacyInvoicesSettings(window.localStorage) },
);

// ── The account's old row, adopted once ──────────────────────────────────────

/** Set once per account on this device, when there is nothing (more) to adopt. */
export const migratedFlag = (uid: string) => `invoices:tune-migrated:${uid}`;
/** The SDK's device stamp for this store (syncedSettings.ts: `unisim:tune-stamp:app:<app>`). */
export const STAMP_KEY = `unisim:tune-stamp:app:${PRODUCT}`;

type Row = { data?: unknown } | null;
/** The two reads and the one write the migration needs (Supabase in the app, a fake in the tests). */
export interface MigrationIo {
  read(app: string): Promise<{ data: Row; error: unknown }>;
  write(app: string, data: unknown): Promise<unknown>;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  now(): number;
}

/**
 * The one-off move of an account's settings from the `invoices` useUserPrefs
 * row to `tune-app:invoices`, run once per account per device when it signs
 * in (LegacyPrefsMigration.tsx).
 *
 *   • The new row has a set → the account has moved: nothing to do, ever again.
 *   • Else the old row holds neither setting → nothing to adopt.
 *   • Else this device changed a setting itself since the move (it has a
 *     stamp for this account, or a guest's) → its set is newer, and the SDK
 *     sends it.
 *   • Else adopt: the old row's values go on this device AND to the new row,
 *     stamped, so the account's other devices (a brand-new one included) get
 *     them from there. The old row is then never read for them again.
 *
 * Returns what it did, for the tests. A failed read leaves the flag unset, so
 * the next load tries again.
 */
export async function migrateLegacyPrefs(uid: string, io: MigrationIo): Promise<'moved' | 'nothing' | 'device-newer' | 'adopted' | 'failed'> {
  const flag = migratedFlag(uid);
  const done = () => { try { io.storage.setItem(flag, '1'); } catch { /* tried again next load */ } };
  try {
    if (io.storage.getItem(flag)) return 'moved';
    const fresh = await io.read(settingsRowApp(PRODUCT));
    if (fresh.error) return 'failed';
    if (parseSettingsRow(fresh.data?.data)) { done(); return 'moved'; }
    const old = await io.read(PRODUCT);
    if (old.error) return 'failed';
    const values = pickLegacySettings(old.data?.data);
    if (!values) { done(); return 'nothing'; }
    let stamp: { uid?: unknown; guest?: unknown } | null = null;
    try { stamp = JSON.parse(io.storage.getItem(STAMP_KEY) ?? 'null'); } catch { /* none */ }
    if (stamp && (stamp.guest === true || !stamp.uid || stamp.uid === uid)) { done(); return 'device-newer'; }

    const before = JSON.stringify(useInvoicesSettings.getState());
    const at = io.now();
    // Stamped first: if the values differ, the store's own change re-stamps and
    // the SDK sends them (one write); if they are already here (this device's
    // copy of the old row), nothing changes and the write is ours.
    io.storage.setItem(STAMP_KEY, JSON.stringify({ at, uid }));
    useInvoicesSettings.set(values);
    if (JSON.stringify(useInvoicesSettings.getState()) === before) {
      await io.write(settingsRowApp(PRODUCT), { at, values: useInvoicesSettings.getState() });
    }
    done();
    return 'adopted';
  } catch {
    return 'failed';
  }
}
