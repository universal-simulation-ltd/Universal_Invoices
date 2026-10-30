import { useEffect, useRef } from 'react';
import { useUniversal, useUser } from '@unisim/sdk';
import { CLOUD_PRODUCT, CLOUD_TABLE, mergeCloud, pack, unpack } from '../lib/cloud';
import { readTombstones, writeTombstones } from '../lib/deletions';
import { useAppStore } from '../stores/appStore';

/**
 * Keeps an online copy on the signed-in Universal ID (James, 2026-10-30: "if
 * signed in backup data online to account (reasonable limit unless
 * enterprise)") — the platform's `app_backups` row, 10 MB or 50 MB on
 * Enterprise, enforced by the database (migration 0320). Renders nothing;
 * the menu and the footer show `cloud` from the store.
 *
 * Signed in: on load it reads the copy and merges in what other devices did
 * (lib/cloud.ts — newest edit wins, deletions travel), then uploads a few
 * seconds after every change. The upload is compare-and-set on `rev`, so a
 * device that missed another's upload merges first instead of replacing it.
 * Signed out, nothing leaves the browser.
 */

const DEBOUNCE_MS = 3000;
const FALLBACK_LIMIT = 10 * 1024 * 1024;

interface Prefs {
  off?: boolean;
  /** The copy's `rev` this browser last merged or wrote. */
  rev?: number;
}
const prefsKey = (uid: string) => `universal-invoices:cloud:${uid}`;
function readPrefs(uid: string): Prefs {
  try {
    return JSON.parse(localStorage.getItem(prefsKey(uid)) ?? '{}') as Prefs;
  } catch {
    return {};
  }
}
function writePrefs(uid: string, patch: Prefs) {
  try {
    localStorage.setItem(prefsKey(uid), JSON.stringify({ ...readPrefs(uid), ...patch }));
  } catch {
    /* blocked storage: it re-merges next time, which is safe */
  }
}

/** Errors that mean "the table or function is not there yet" (0320 not applied). */
const missing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || /does not exist|schema cache/i.test(e.message ?? ''));

const fingerprint = () => {
  const { companies, clients, products, documents } = useAppStore.getState();
  return JSON.stringify([companies, clients, products, documents, readTombstones().length]);
};

/** The menu's controls, set while the engine is mounted. */
export const cloudControls: { turnOff?: () => Promise<void>; turnOn?: () => void; syncNow?: () => void } = {};

export default function CloudBackup() {
  const { supabase } = useUniversal();
  const { user } = useUser();
  const loaded = useAppStore((s) => s.loaded);
  const companies = useAppStore((s) => s.companies);
  const clients = useAppStore((s) => s.clients);
  const products = useAppStore((s) => s.products);
  const documents = useAppStore((s) => s.documents);
  const setCloud = useAppStore((s) => s.setCloud);
  const applyCloud = useAppStore((s) => s.applyCloud);

  const uid = user && !(user as { is_anonymous?: boolean }).is_anonymous ? user.id : null;
  const running = useRef(false);
  const again = useRef(false);
  const ready = useRef(false); // the first read has happened for this user
  const uploaded = useRef<string | null>(null);
  const limit = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function sync(attempt = 0): Promise<void> {
    if (!uid || readPrefs(uid).off) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      if (limit.current === null) {
        const { data, error } = await supabase.rpc('app_backup_limit');
        if (missing(error)) {
          setCloud({ status: 'unavailable', message: 'Online backup is not switched on for this server yet.' });
          return;
        }
        limit.current = typeof data === 'number' ? data : FALLBACK_LIMIT;
        setCloud({ limit: limit.current });
      }
      const { data: row, error } = await supabase
        .from(CLOUD_TABLE)
        .select('data, rev, updated_at')
        .eq('product', CLOUD_PRODUCT)
        .maybeSingle();
      if (missing(error)) {
        setCloud({ status: 'unavailable', message: 'Online backup is not switched on for this server yet.' });
        return;
      }
      if (error) throw error;

      let due = uploaded.current !== fingerprint();
      if (row && row.rev !== readPrefs(uid).rev) {
        // Something new online: another device, or this browser's first time.
        const s = useAppStore.getState();
        const merge = mergeCloud(
          { companies: s.companies, clients: s.clients, products: s.products, documents: s.documents },
          readTombstones(),
          unpack(row.data),
        );
        writeTombstones(merge.deleted);
        await applyCloud(merge);
        writePrefs(uid, { rev: row.rev });
        due = merge.localAhead;
        if (!due) uploaded.current = fingerprint();
      }
      ready.current = true;
      if (!due && row) {
        setCloud({ status: 'saved', at: Date.parse(row.updated_at), bytes: row.data.length, message: null });
        return;
      }

      const s = useAppStore.getState();
      const print = fingerprint();
      const text = pack({ companies: s.companies, clients: s.clients, products: s.products, documents: s.documents }, readTombstones());
      const cap = limit.current ?? FALLBACK_LIMIT;
      if (text.length > cap) {
        setCloud({ status: 'too-large', bytes: text.length, message: null });
        return;
      }
      setCloud({ status: 'saving' });
      const res = row
        ? await supabase.from(CLOUD_TABLE).update({ data: text }).eq('product', CLOUD_PRODUCT).eq('rev', row.rev).select('rev, updated_at')
        : await supabase.from(CLOUD_TABLE).insert({ user_id: uid, product: CLOUD_PRODUCT, data: text }).select('rev, updated_at');
      if (res.error) {
        if (/app_backup_too_large/.test(res.error.message)) {
          setCloud({ status: 'too-large', bytes: text.length, message: null });
          return;
        }
        // Another device created the row first: read it and merge.
        if (res.error.code === '23505' && attempt < 3) {
          again.current = true;
          return;
        }
        throw res.error;
      }
      const saved = res.data?.[0];
      if (!saved) {
        // `rev` moved on under us — another device uploaded. Merge, then retry.
        if (attempt < 3) again.current = true;
        return;
      }
      writePrefs(uid, { rev: saved.rev });
      uploaded.current = print;
      setCloud({ status: 'saved', at: Date.parse(saved.updated_at), bytes: text.length, message: null });
    } catch (e) {
      setCloud({ status: 'error', message: e instanceof Error ? e.message : 'The online backup could not be reached.' });
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        void sync(attempt + 1);
      }
    }
  }

  // Sign-in, sign-out, a different account.
  useEffect(() => {
    ready.current = false;
    uploaded.current = null;
    limit.current = null;
    if (!uid) {
      setCloud({ status: 'signed-out', at: null, bytes: null, limit: null, message: null });
      return;
    }
    if (!loaded) return;
    if (readPrefs(uid).off) {
      setCloud({ status: 'off', message: null });
      return;
    }
    setCloud({ status: 'loading' });
    void sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sync` reads refs and the store, not render values
  }, [uid, loaded]);

  // A change: upload once things settle. Not before the first read, or a
  // fresh browser would push its empty dataset over the real one.
  useEffect(() => {
    if (!uid || !ready.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void sync(), DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as above
  }, [companies, clients, products, documents]);

  // Coming back to the tab: pick up what another device did meanwhile.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && uid && ready.current) void sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as above
  }, [uid]);

  useEffect(() => {
    cloudControls.syncNow = () => void sync();
    cloudControls.turnOn = () => {
      if (!uid) return;
      writePrefs(uid, { off: false, rev: undefined });
      setCloud({ status: 'loading' });
      void sync();
    };
    cloudControls.turnOff = async () => {
      if (!uid) return;
      writePrefs(uid, { off: true, rev: undefined });
      // Off means off: the copy goes too. This browser keeps everything.
      await supabase.from(CLOUD_TABLE).delete().eq('product', CLOUD_PRODUCT);
      setCloud({ status: 'off', at: null, bytes: null, message: null });
    };
    return () => {
      cloudControls.syncNow = cloudControls.turnOn = cloudControls.turnOff = undefined;
    };
  });

  return null;
}
