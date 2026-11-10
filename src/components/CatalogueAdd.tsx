// The picker "+ From catalogue" opens, under the last row of the PDF preview
// (James, 2026-11-10: "make from catalogue on pdf renderer shorter in width so
// doesn't overlap with titles, on click show a more graphical choice of
// catalogue with collapsibles per group").
//
// It used to be a <select>, as wide as its longest option — 80 characters,
// across the page's column titles. Now it is a short button, and the choice is
// a sheet of tiles (picture, code, description, price), one collapsible group
// per catalogue folder in the catalogue's own order. A tile adds a line and the
// sheet stays open, so several can be added in one go; Done (or Escape) closes.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatMoney } from '@unisim/doc';
import { arrange, type Entry } from '../lib/arrange';
import type { Folder, InvoiceDoc, Product } from '../lib/types';
import { btnGhost, btnPrimary, inputCls } from './ui';

interface Props {
  catalogue: Product[];
  folders: Folder[];
  doc: InvoiceDoc;
  onAdd: (p: Product) => void;
}

const firstLine = (p: Product) => p.description.split('\n')[0];

// Groups as the catalogue shows them: each folder, and each run of loose
// products between folders as an unnamed group.
type Group = { id: string; name: string | null; items: Product[] };
function groups(entries: Entry[]): Group[] {
  const out: Group[] = [];
  for (const e of entries) {
    if (e.kind === 'folder') {
      if (e.items.length) out.push({ id: e.folder.id, name: e.folder.name, items: e.items });
    } else {
      const last = out[out.length - 1];
      if (last && last.name === null) last.items.push(e.product);
      else out.push({ id: `loose-${e.product.id}`, name: null, items: [e.product] });
    }
  }
  return out;
}

// Rendered by DocumentEditor, not inside the preview: the "+ From catalogue"
// button sits under the last row and moves (even to the next page) as lines are
// added, which would unmount a picker that lived beside it.
export default function CataloguePicker(props: Props & { onClose: () => void }) {
  return createPortal(<Picker {...props} />, document.body);
}

function Picker({ catalogue, folders, doc, onAdd, onClose }: Props & { onClose: () => void }) {
  const titleId = useId();
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState<Record<string, number>>({});
  const all = useMemo(() => groups(arrange(catalogue, folders)), [catalogue, folders]);
  // A small catalogue opens with every folder open; a big one folded, so the
  // folder names are the first thing to read.
  const [shut, setShut] = useState<Set<string>>(() => (catalogue.length > 12 ? new Set(all.filter((g) => g.name).map((g) => g.id)) : new Set()));

  const q = query.trim().toLowerCase();
  const shown = q
    ? all
        .map((g) => ({ ...g, items: g.items.filter((p) => `${p.code} ${p.description} ${g.name ?? ''}`.toLowerCase().includes(q)) }))
        .filter((g) => g.items.length)
    : all;
  const total = Object.values(added).reduce((a, b) => a + b, 0);

  useEffect(() => {
    search.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const add = (p: Product) => {
    onAdd(p);
    setAdded((a) => ({ ...a, [p.id]: (a[p.id] ?? 0) + 1 }));
  };

  const tile = (p: Product) => (
    <li key={p.id}>
      <button
        type="button"
        onClick={() => add(p)}
        className="group relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-orange-400 hover:shadow-md focus-visible:border-orange-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 dark:border-slate-700 dark:bg-slate-900"
        aria-label={`Add ${[p.code, firstLine(p)].filter(Boolean).join(' — ')}`}
      >
        <span className="flex aspect-[4/3] w-full items-center justify-center bg-slate-50 dark:bg-slate-800">
          {p.image ? (
            <img src={p.image.dataUrl} alt="" className="h-full w-full object-contain p-2" />
          ) : (
            <span aria-hidden className="text-lg font-semibold tracking-wide text-slate-300 dark:text-slate-600">
              {(p.code || firstLine(p)).slice(0, 4).toUpperCase() || '—'}
            </span>
          )}
        </span>
        <span className="flex flex-1 flex-col gap-0.5 p-2">
          {p.code && <span className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{p.code}</span>}
          <span className="line-clamp-2 text-xs text-slate-800 dark:text-slate-100">{firstLine(p) || 'No description'}</span>
          <span className="mt-auto pt-1 text-xs font-semibold text-slate-900 dark:text-slate-100">
            {formatMoney(p.unitPrice, doc.currency, doc.numberStyle, true)}
            {p.unit && <span className="font-normal text-slate-500 dark:text-slate-400"> / {p.unit}</span>}
          </span>
        </span>
        <span
          aria-hidden
          className={`absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold shadow ${
            added[p.id] ? 'bg-orange-500 text-white' : 'bg-white/90 text-orange-600 opacity-0 ring-1 ring-orange-200 group-hover:opacity-100 dark:bg-slate-900/90'
          }`}
        >
          {added[p.id] ? `✓${added[p.id] > 1 ? ` ${added[p.id]}` : ''}` : '+'}
        </span>
      </button>
    </li>
  );

  return (
    // Its own root (a portal), but React still bubbles events to the preview
    // page underneath — which would start a drag or open a row. Stop them here.
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-6"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
    >
      <div role="dialog" aria-modal aria-labelledby={titleId} className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 id={titleId} className="mr-auto text-sm font-semibold text-slate-900 dark:text-slate-100">
            Add from your catalogue
          </h2>
          {total > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
              {total} line{total === 1 ? '' : 's'} added
            </span>
          )}
          <button type="button" className={total ? btnPrimary : btnGhost} onClick={onClose}>
            Done
          </button>
          <input ref={search} className={`${inputCls} basis-full`} placeholder="Search by code or description" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the catalogue" />
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {shown.map((g) => {
            const grid = <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">{g.items.map(tile)}</ul>;
            if (!g.name) return <div key={g.id}>{grid}</div>;
            const closed = !q && shut.has(g.id);
            return (
              <section key={g.id} className="rounded-xl border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  aria-expanded={!closed}
                  aria-controls={`${titleId}-${g.id}`}
                  onClick={() =>
                    setShut((s) => {
                      const next = new Set(s);
                      if (next.has(g.id)) next.delete(g.id);
                      else next.add(g.id);
                      return next;
                    })
                  }
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <svg aria-hidden viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${closed ? '' : 'rotate-90'}`} fill="currentColor">
                    <path d="M7.5 4.5 13 10l-5.5 5.5-1.4-1.4L10.2 10 6.1 5.9z" />
                  </svg>
                  <span className="mr-auto truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{g.name}</span>
                  {closed && (
                    <span aria-hidden className="flex -space-x-2">
                      {g.items
                        .filter((p) => p.image)
                        .slice(0, 4)
                        .map((p) => (
                          <img key={p.id} src={p.image!.dataUrl} alt="" className="h-6 w-6 rounded-full border-2 border-white bg-white object-cover dark:border-slate-900" />
                        ))}
                    </span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{g.items.length}</span>
                </button>
                {!closed && (
                  <div id={`${titleId}-${g.id}`} className="px-3 pb-3">
                    {grid}
                  </div>
                )}
              </section>
            );
          })}
          {shown.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nothing in the catalogue matches “{query}”.</p>}
        </div>
      </div>
    </div>
  );
}
