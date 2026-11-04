import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { useUniversal, useUser } from '@unisim/sdk';
import {
  buildPayload,
  COMPANY_SHARE_MIME,
  companyRef,
  companyShareUrl,
  deriveKey,
  followShared,
  incomingRows,
  makeCode,
  makeSecret,
  needsCode,
  normCode,
  normInitials,
  payloadStamp,
  receivedCompany,
  seal,
  secretFromHash,
  sharedDiffers,
  unseal,
  WrongKey,
  type CompanyShareLink,
  type CompanySharePayload,
} from '../lib/companyShare';
import { uid } from '../lib/convert';
import { readTombstones } from '../lib/deletions';
import type { Company } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import { useActiveCompany } from './activeCompany';
import { btnGhost, btnPrimary, card, checkboxCls, inputCls } from './ui';

// A link to a company — the owner's Share panel, what keeps links and copies
// current, and the page a link opens. The crypto and the merging are in
// lib/companyShare.ts.

const PRODUCT = 'invoices';
const KEEP_CURRENT_MS = 4000;

type Supabase = ReturnType<typeof useUniversal>['supabase'];

const isSignedIn = (user: unknown) => !!user && !(user as { is_anonymous?: boolean }).is_anonymous;

// The key takes ~310k PBKDF2 rounds to make: once per link per visit is enough.
const keys = new Map<string, Promise<string>>();
const keyFor = (secret: string, code = '') => {
  const k = `${secret}:${normCode(code)}`;
  if (!keys.has(k)) keys.set(k, deriveKey(secret, code));
  return keys.get(k)!;
};

// What was last sent per link, so an unchanged company is not uploaded again.
const SENT = 'universal-invoices:company-share-sent:';
const sentStamp = (id: string) => {
  try {
    return localStorage.getItem(SENT + id);
  } catch {
    return null;
  }
};
const setSentStamp = (id: string, stamp: string | null) => {
  try {
    if (stamp) localStorage.setItem(SENT + id, stamp);
    else localStorage.removeItem(SENT + id);
  } catch {
    /* storage blocked: it is sent again next visit, which is harmless */
  }
};

/** A link's trouble, per company, for its panel to show. */
const useShareStatus = create<{ errors: Record<string, string | undefined>; setError: (companyId: string, message?: string) => void }>((set) => ({
  errors: {},
  setError: (companyId, message) => set((s) => ({ errors: { ...s.errors, [companyId]: message } })),
}));

interface ShareRow {
  data: string;
  updated_at: string;
  mime_type: string;
  is_owner: boolean;
}

/** A link's row, read through app_share_get(): undefined when it is gone or private; throws when offline. */
async function getShare(supabase: Supabase, id: string): Promise<ShareRow | undefined> {
  const { data, error } = await supabase.rpc('app_share_get', { p_id: id });
  if (error) throw error;
  return (data as ShareRow[] | null)?.[0];
}

function tooLarge(message: string) {
  return /too_large/.test(message)
    ? 'With its pictures this is over 5 MB — too big for a link. Leave out the catalogue, or use smaller pictures.'
    : 'The link could not be saved. Try again in a moment.';
}

function payloadFor(company: Company, link: Pick<CompanyShareLink, 'catalogue' | 'clients'>): CompanySharePayload {
  const { products, folders, clients } = useAppStore.getState();
  return buildPayload(company, { products, folders, clients }, link);
}

/** Make the link: the row first (its id is the database's), then the company remembers it. */
async function makeLink(supabase: Supabase, userId: string, company: Company, opts: { catalogue: boolean; clients: boolean; code: boolean }): Promise<CompanyShareLink> {
  const secret = makeSecret();
  const code = opts.code ? makeCode() : undefined;
  const payload = payloadFor(company, opts);
  const data = await seal(payload, await keyFor(secret, code), !!code);
  const { data: row, error } = await supabase
    .from('app_shares')
    .upsert(
      { user_id: userId, product: PRODUCT, ref_id: companyRef(company.id), title: 'Company', file_name: '', mime_type: COMPANY_SHARE_MIME, data, public: true },
      { onConflict: 'user_id,product,ref_id' },
    )
    .select('id')
    .single();
  if (error || !row) throw new Error(tooLarge(error?.message ?? ''));
  const link: CompanyShareLink = { id: (row as { id: string }).id, secret, ...(code ? { code } : {}), catalogue: opts.catalogue, clients: opts.clients };
  setSentStamp(link.id, await payloadStamp(payload));
  return link;
}

/** The latest company over the existing row. False when the row has gone (stopped on another device). */
async function refreshLink(supabase: Supabase, company: Company, link: CompanyShareLink): Promise<boolean> {
  const payload = payloadFor(company, link);
  const stamp = await payloadStamp(payload);
  if (sentStamp(link.id) === stamp) return true;
  const data = await seal(payload, await keyFor(link.secret, link.code), !!link.code);
  const { data: rows, error } = await supabase.from('app_shares').update({ data }).eq('id', link.id).select('id');
  if (error) throw new Error(tooLarge(error.message));
  if (!rows?.length) return false;
  setSentStamp(link.id, stamp);
  return true;
}

/**
 * In a company's form: share it by link. Signed in only — the link is kept on
 * your Universal ID. Shown for a saved company of your own, not for one
 * someone shared with you.
 */
export function CompanySharePanel({ companyId }: { companyId: string }) {
  const { supabase } = useUniversal();
  const { user } = useUser();
  const signedIn = isSignedIn(user);
  const company = useAppStore((s) => s.companies.find((c) => c.id === companyId));
  // Two numbers, not one object: a new object every time would re-render forever.
  const productCount = useAppStore((s) => s.products.filter((p) => !p.example).length);
  const clientCount = useAppStore((s) => s.clients.filter((c) => !c.example).length);
  const counts = { products: productCount, clients: clientCount };
  const syncCompany = useAppStore((s) => s.syncCompany);
  const keptError = useShareStatus((s) => s.errors[companyId]);
  const [opts, setOpts] = useState({ catalogue: false, clients: false, code: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);

  if (!company || company.example || company.sharedFrom) return null;
  const link = company.shareLink;
  const url = link ? companyShareUrl(location.origin, import.meta.env.BASE_URL, link) : '';

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    fn()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  const copy = (what: 'link' | 'code', text: string) =>
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    });

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-800">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100">Share this company</h3>
      {!signedIn ? (
        <p className="text-slate-600 dark:text-slate-400">
          Sign in with your Universal ID (top right) to get a link that lets someone else make documents from this company. Signed out, nothing leaves this browser.
        </p>
      ) : !link ? (
        <>
          <p className="text-slate-600 dark:text-slate-400">
            A link that adds {company.name || 'this company'} to someone else’s Universal Invoices, so they can make documents from it — no account needed. Their documents stay on their device: you do not see them, and they do not see yours. The details follow your changes while the link lasts.
          </p>
          <div className="space-y-2 text-slate-700 dark:text-slate-300">
            <label className="flex items-start gap-2">
              <input type="checkbox" className={`${checkboxCls} mt-0.5`} checked={opts.catalogue} onChange={(e) => setOpts({ ...opts, catalogue: e.target.checked })} />
              <span>Include the catalogue ({counts.products} item{counts.products === 1 ? '' : 's'})</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className={`${checkboxCls} mt-0.5`} checked={opts.clients} onChange={(e) => setOpts({ ...opts, clients: e.target.checked })} />
              <span>Include your clients ({counts.clients})</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className={`${checkboxCls} mt-0.5`} checked={opts.code} onChange={(e) => setOpts({ ...opts, code: e.target.checked })} />
              <span>
                Ask for a code as well
                <span className="block text-xs text-slate-500 dark:text-slate-400">Send the code another way — a text or a call — so the link on its own opens nothing.</span>
              </span>
            </label>
          </div>
          <button
            type="button"
            className={btnGhost}
            disabled={busy}
            onClick={() =>
              run(async () => {
                const made = await makeLink(supabase, user!.id, company, opts);
                // The stored company as it is now, with its link: the form's draft is saved separately and keeps it (CompaniesView).
                const now = useAppStore.getState().companies.find((c) => c.id === companyId) ?? company;
                await syncCompany({ ...now, shareLink: made });
              })
            }
          >
            {busy ? 'Making the link…' : 'Get a link'}
          </button>
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <input readOnly className={`${inputCls} text-xs`} value={url} onFocus={(e) => e.target.select()} aria-label="Link" />
            <button type="button" className={btnGhost} onClick={() => copy('link', url)}>
              {copied === 'link' ? 'Copied' : 'Copy'}
            </button>
          </div>
          {link.code && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-600 dark:text-slate-400">Code</span>
              <span className="font-mono text-base font-semibold tracking-widest text-slate-900 dark:text-slate-100">{link.code}</span>
              <button type="button" className={btnGhost} onClick={() => copy('code', link.code!)}>
                {copied === 'code' ? 'Copied' : 'Copy code'}
              </button>
              <span className="w-full text-xs text-slate-500 dark:text-slate-400">Send it separately from the link. Without it, the link opens nothing.</span>
            </div>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Anyone with the link{link.code ? ' and the code' : ''} can add this company
            {link.catalogue && link.clients ? ', your catalogue and your clients' : link.catalogue ? ' and your catalogue' : link.clients ? ' and your clients' : ''} and make documents from it. Changes you make here reach them by themselves. Their documents stay with them.
          </p>
          {keptError && <p className="text-red-700 dark:text-red-400">{keptError}</p>}
          <button
            type="button"
            className="text-xs font-medium text-red-700 hover:underline dark:text-red-400"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const { error: e } = await supabase.from('app_shares').delete().eq('id', link.id);
                if (e) throw new Error('The link could not be removed. Try again in a moment.');
                setSentStamp(link.id, null);
                const now = useAppStore.getState().companies.find((c) => c.id === companyId) ?? company;
                const rest = { ...now };
                delete rest.shareLink;
                await syncCompany(rest);
              })
            }
          >
            Stop sharing and delete the link
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">Whoever already added it keeps their copy and their documents; it just stops following your changes.</p>
        </>
      )}
      {error && <p className="text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

/**
 * Always mounted. Keeps your links current as you change a shared company
 * (signed in), and brings the companies shared with you up to their owners'
 * latest (signed in or not). Renders nothing.
 */
export function CompanyShareSync() {
  const { supabase } = useUniversal();
  const { user, loading } = useUser();
  const signedIn = isSignedIn(user);
  const loaded = useAppStore((s) => s.loaded && s.scope === (signedIn ? user!.id : null));
  const companies = useAppStore((s) => s.companies);
  const products = useAppStore((s) => s.products);
  const folders = useAppStore((s) => s.folders);
  const clients = useAppStore((s) => s.clients);
  const syncCompany = useAppStore((s) => s.syncCompany);
  const takeShared = useAppStore((s) => s.takeShared);
  const setError = useShareStatus((s) => s.setError);
  const followed = useRef(new Set<string>());

  // Yours: a few seconds after a change, the link carries it.
  useEffect(() => {
    if (!signedIn || !loaded) return;
    const shared = companies.filter((c) => c.shareLink && !c.example);
    if (!shared.length) return;
    const t = setTimeout(() => {
      for (const c of shared) {
        void refreshLink(supabase, c, c.shareLink!)
          .then(async (alive) => {
            setError(c.id, undefined);
            if (alive) return;
            // Stopped on another of your devices: forget it here too.
            const rest = { ...c };
            delete rest.shareLink;
            await syncCompany(rest);
          })
          .catch((e: unknown) => setError(c.id, e instanceof Error ? e.message : String(e)));
      }
    }, KEEP_CURRENT_MS);
    return () => clearTimeout(t);
  }, [signedIn, loaded, companies, products, folders, clients, supabase, syncCompany, setError]);

  // Theirs: once a visit each, and again when you come back to the tab.
  useEffect(() => {
    if (loading || !loaded) return;
    const follow = async () => {
      for (const c of useAppStore.getState().companies) {
        const from = c.sharedFrom;
        if (!from || from.ended || followed.current.has(from.id)) continue;
        followed.current.add(from.id);
        let row: ShareRow | undefined;
        try {
          row = await getShare(supabase, from.id);
        } catch {
          continue; // offline — try again next visit
        }
        const now = useAppStore.getState().companies.find((x) => x.id === c.id);
        if (!now?.sharedFrom) continue;
        if (!row) {
          // The owner stopped sharing: the copy stays as it is, yours to edit.
          await syncCompany({ ...now, sharedFrom: { ...now.sharedFrom, ended: true } });
          continue;
        }
        if (row.updated_at === now.sharedFrom.updatedAt) continue;
        let payload: CompanySharePayload;
        try {
          payload = await unseal(row.data, now.sharedFrom.key);
        } catch {
          continue;
        }
        const s = useAppStore.getState();
        const deleted = new Set(readTombstones().map((t) => t.id));
        const rows = {
          products: incomingRows(s.products, payload.products, deleted),
          folders: incomingRows(s.folders, payload.folders, deleted),
          clients: incomingRows(s.clients, payload.clients, deleted),
        };
        if (!sharedDiffers(now, payload) && !rows.products.length && !rows.folders.length && !rows.clients.length) {
          // Nothing that changes this copy (the owner edited something it does not carry).
          continue;
        }
        await takeShared(followShared(now, payload, row.updated_at), rows);
      }
    };
    void follow();
    const again = () => {
      if (document.visibilityState !== 'visible') return;
      followed.current.clear();
      void follow();
    };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [loading, loaded, supabase, syncCompany, takeShared]);

  return null;
}

type Landing =
  | { state: 'loading' }
  | { state: 'none'; why: 'missing' | 'gone' }
  | { state: 'own' }
  | { state: 'code'; data: string; secret: string; updatedAt: string }
  | { state: 'ready'; payload: CompanySharePayload; key: string; updatedAt: string };

/**
 * What a company link opens (?company=<id>#k=<secret>): asks for the code if
 * the owner set one, shows the company, and adds it to Your companies. No
 * account needed — the documents made from it stay in this browser.
 */
export function SharedCompanyLanding({ id, onDone }: { id: string; onDone: () => void }) {
  const { supabase } = useUniversal();
  const { user } = useUser();
  const signedIn = isSignedIn(user);
  const loaded = useAppStore((s) => s.loaded);
  const companies = useAppStore((s) => s.companies);
  const takeShared = useAppStore((s) => s.takeShared);
  const { setActive } = useActiveCompany();
  const [landing, setLanding] = useState<Landing>({ state: 'loading' });
  const [code, setCode] = useState('');
  const [initials, setInitials] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const already = companies.find((c) => c.sharedFrom?.id === id);

  useEffect(() => {
    const secret = secretFromHash(location.hash);
    if (!secret) {
      setLanding({ state: 'none', why: 'missing' });
      return;
    }
    let gone = false;
    void (async () => {
      const row = await getShare(supabase, id).catch(() => undefined);
      if (gone) return;
      if (!row || row.mime_type !== COMPANY_SHARE_MIME) return setLanding({ state: 'none', why: 'gone' });
      if (row.is_owner) return setLanding({ state: 'own' });
      try {
        if (needsCode(row.data)) return setLanding({ state: 'code', data: row.data, secret, updatedAt: row.updated_at });
        const key = await keyFor(secret);
        const payload = await unseal(row.data, key);
        if (!gone) setLanding({ state: 'ready', payload, key, updatedAt: row.updated_at });
      } catch {
        if (!gone) setLanding({ state: 'none', why: 'missing' });
      }
    })();
    return () => {
      gone = true;
    };
    // Signing in may turn it into your own link.
  }, [supabase, id, user?.id]);

  const open = (
    <button type="button" className={btnPrimary} onClick={onDone}>
      Open Universal Invoices
    </button>
  );
  const box = (children: ReactNode) => <div className={`${card} mx-auto max-w-xl space-y-4 text-sm text-slate-700 dark:text-slate-300`}>{children}</div>;

  if (landing.state === 'loading') return <p className="py-10 text-center text-sm text-slate-500">Opening the link…</p>;
  if (landing.state === 'none') {
    return box(
      <>
        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">{landing.why === 'missing' ? 'This link is not complete' : 'This company is no longer shared'}</h1>
        <p>{landing.why === 'missing' ? 'Part of the link is missing — the bit after the #. Ask for it again, and copy all of it.' : 'Ask whoever sent it for a new link.'}</p>
        {open}
      </>,
    );
  }
  if (landing.state === 'own') {
    return box(
      <>
        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">This is your own company’s link</h1>
        <p>Send it to whoever should make documents for this company. Stop sharing it from the company in Your companies.</p>
        {open}
      </>,
    );
  }
  if (landing.state === 'code') {
    const tryCode = () => {
      setBusy(true);
      setError(null);
      void (async () => {
        try {
          const key = await keyFor(landing.secret, code);
          const payload = await unseal(landing.data, key);
          setLanding({ state: 'ready', payload, key, updatedAt: landing.updatedAt });
        } catch (e) {
          await new Promise((r) => setTimeout(r, 800));
          setError(e instanceof WrongKey ? 'That code does not match this link. Check it with whoever sent it.' : e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      })();
    };
    return box(
      <>
        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">Someone shared a company with you</h1>
        <p>Type the code they sent you with it — 8 letters and numbers.</p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (normCode(code).length === 8 && !busy) tryCode();
          }}
        >
          <input
            className={`${inputCls} max-w-[12rem] font-mono uppercase tracking-widest`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-label="Code"
          />
          <button type="submit" className={btnPrimary} disabled={busy || normCode(code).length !== 8}>
            {busy ? 'Checking…' : 'Open'}
          </button>
        </form>
        {error && <p className="text-red-700 dark:text-red-400">{error}</p>}
      </>,
    );
  }

  const { payload, key, updatedAt } = landing;
  const c = payload.company;
  if (already) {
    return box(
      <>
        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">{already.name} is already in your companies</h1>
        <p>Its details follow the link by themselves.</p>
        <button
          type="button"
          className={btnPrimary}
          onClick={() => {
            setActive(already.id);
            onDone();
          }}
        >
          Make documents from it
        </button>
      </>,
    );
  }
  const tag = normInitials(initials);
  const sample = Object.values(c.numbering)[0]?.pattern;
  const extras = [
    payload.products.length ? `its catalogue (${payload.products.length} item${payload.products.length === 1 ? '' : 's'})` : '',
    payload.clients.length ? `${payload.clients.length} client${payload.clients.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return box(
    <>
      <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">A company shared with you</h1>
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        {c.logo ? <img src={c.logo.dataUrl} alt="" className="h-12 w-20 shrink-0 object-contain" /> : null}
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 dark:text-slate-100">{c.name}</div>
          <div className="truncate text-slate-500 dark:text-slate-400">{c.address.filter(Boolean).join(', ')}</div>
        </div>
      </div>
      <p>
        Add it to your companies to make quotes, invoices and other documents from it{extras.length ? `, with ${extras.join(' and ')}` : ''}. Its details follow the owner’s changes while they share it.
      </p>
      <p>
        <span className="font-semibold">Your documents stay with you</span> — in this browser{signedIn ? ' and on your Universal ID' : ''}. {c.name} does not see them, and you do not see theirs.
      </p>
      <label className="block space-y-1">
        <span className="block font-medium text-slate-900 dark:text-slate-100">Your initials</span>
        <input className={`${inputCls} max-w-[8rem] uppercase`} value={initials} onChange={(e) => setInitials(e.target.value)} maxLength={6} placeholder="e.g. BS" autoComplete="off" />
        <span className="block text-xs text-slate-500 dark:text-slate-400">
          Added to the end of your numbers{sample && tag ? ` (${sample}-${tag})` : ''}, so they never match {c.name}’s own. Your numbering starts at 1.
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={!loaded || busy}
          onClick={() => {
            setBusy(true);
            void (async () => {
              try {
                const s = useAppStore.getState();
                const company = receivedCompany(payload, { id, key, updatedAt }, initials, uid);
                await takeShared(company, {
                  products: incomingRows(s.products, payload.products, new Set()),
                  folders: incomingRows(s.folders, payload.folders, new Set()),
                  clients: incomingRows(s.clients, payload.clients, new Set()),
                });
                setActive(company.id);
                useAppStore.setState({ notice: `${company.name} is in your companies and active: new documents come from it.` });
                onDone();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? 'Adding…' : 'Add to my companies'}
        </button>
        <button type="button" className={btnGhost} onClick={onDone}>
          Not now
        </button>
      </div>
      {error && <p className="text-red-700 dark:text-red-400">{error}</p>}
    </>,
  );
}
