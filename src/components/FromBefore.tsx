import { useEffect, useState } from 'react';
import { loadAll } from '../lib/store';
import type { Company } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import { btnGhost, btnPrimary, checkboxCls } from './ui';

const hiddenKey = (account: string) => `universal-invoices:from-before-hidden:${account}`;

/**
 * Until 2026-11-03 every account in a browser shared one database; now each
 * has its own and the old one is what you see signed out (lib/store.ts). On
 * the way, an empty new database replaced its account's online copy and
 * companies went missing (James: "I've lost my HRV company"). They are still
 * in the old database: this lists the ones not here and brings back the
 * ticked ones, with their documents. Signed in only; hidden for good once
 * dismissed.
 */
export default function FromBefore() {
  const scope = useAppStore((s) => s.scope);
  const companies = useAppStore((s) => s.companies);
  const bringIn = useAppStore((s) => s.bringIn);
  const [old, setOld] = useState<{ companies: Company[]; docs: Record<string, number>; catalogue: number } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [catalogue, setCatalogue] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!scope) return;
    try {
      setHidden(localStorage.getItem(hiddenKey(scope)) === '1');
    } catch {
      /* blocked storage: shown */
    }
    let gone = false;
    void loadAll(null).then((all) => {
      if (gone) return;
      const docs: Record<string, number> = {};
      for (const d of all.documents) if (!d.example) docs[d.companyId] = (docs[d.companyId] ?? 0) + 1;
      setOld({ companies: all.companies.filter((c) => !c.example), docs, catalogue: all.products.filter((p) => !p.example).length });
    });
    return () => {
      gone = true;
    };
  }, [scope]);

  if (!scope || hidden || !old) return null;
  const here = new Set(companies.map((c) => c.id));
  const missing = old.companies.filter((c) => !here.has(c.id));
  if (!missing.length) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-slate-800 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-slate-200">
      <p>
        <span className="font-semibold">Missing a company?</span> This browser still has these from before each account kept its own. Tick the ones that belong to this account to bring them back with their documents.
      </p>
      <ul className="space-y-1">
        {missing.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className={checkboxCls}
                checked={picked.has(c.id)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(c.id);
                  else next.delete(c.id);
                  setPicked(next);
                }}
              />
              <span className="font-medium">{c.name || 'Unnamed company'}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {old.docs[c.id] ? `${old.docs[c.id]} document${old.docs[c.id] === 1 ? '' : 's'}` : 'no documents'}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {old.catalogue > 0 && (
        <label className="flex items-center gap-2">
          <input type="checkbox" className={checkboxCls} checked={catalogue} onChange={(e) => setCatalogue(e.target.checked)} />
          And the whole catalogue there ({old.catalogue} item{old.catalogue === 1 ? '' : 's'})
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={busy || (!picked.size && !catalogue)}
          onClick={async () => {
            setBusy(true);
            try {
              await bringIn([...picked], catalogue);
              setPicked(new Set());
              setCatalogue(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          Bring back the ticked
        </button>
        <button
          type="button"
          className={btnGhost}
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(hiddenKey(scope), '1');
            } catch {
              /* shown again next time, which is harmless */
            }
          }}
        >
          None of these are mine
        </button>
      </div>
    </div>
  );
}

const catalogueHiddenKey = (account: string) => `universal-invoices:from-before-catalogue-hidden:${account}`;

/**
 * The catalogue's twin of FromBefore, in the Catalogue tab (James,
 * 2026-11-03: "my catalogue was lost in the company transition"): the
 * catalogue items this browser still has from before each account kept its
 * own, brought back with their folders. Merges — an item already here keeps
 * the newer of the two.
 */
export function CatalogueFromBefore() {
  const scope = useAppStore((s) => s.scope);
  const products = useAppStore((s) => s.products);
  const bringIn = useAppStore((s) => s.bringIn);
  const [old, setOld] = useState<{ id: string; label: string }[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!scope) return;
    try {
      setHidden(localStorage.getItem(catalogueHiddenKey(scope)) === '1');
    } catch {
      /* blocked storage: shown */
    }
    let gone = false;
    void loadAll(null).then((all) => {
      if (!gone) setOld(all.products.filter((p) => !p.example).map((p) => ({ id: p.id, label: p.code || p.description.split('\n')[0] || 'Unnamed item' })));
    });
    return () => {
      gone = true;
    };
  }, [scope]);

  if (!scope || hidden || !old) return null;
  const here = new Set(products.map((p) => p.id));
  const missing = old.filter((p) => !here.has(p.id));
  if (!missing.length) return null;
  const names = missing.slice(0, 6).map((p) => p.label).join(', ');

  return (
    <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-slate-800 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-slate-200">
      <p>
        <span className="font-semibold">Missing catalogue items?</span> This browser still has {missing.length} from before each account kept its own: {names}
        {missing.length > 6 ? ` and ${missing.length - 6} more` : ''}.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await bringIn([], true);
            } finally {
              setBusy(false);
            }
          }}
        >
          Bring them back
        </button>
        <button
          type="button"
          className={btnGhost}
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(catalogueHiddenKey(scope), '1');
            } catch {
              /* shown again next time, which is harmless */
            }
          }}
        >
          They are not this account’s
        </button>
      </div>
    </div>
  );
}
