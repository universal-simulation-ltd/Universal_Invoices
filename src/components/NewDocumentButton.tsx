import { useEffect, useRef, useState } from 'react';
import { KIND_HINTS, KIND_NAMES, KIND_ORDER, type BusinessDocKind } from '../lib/types';
import { Key, PlusIcon, btnPrimary } from './ui';

/**
 * The one "New" button on Documents (James, 2026-11-03: "a button for new
 * document and when clicking it reveals the choices new quote, estimate etc").
 * It follows the sidebar: with a kind chosen it is "New quote" and makes one
 * in a click; on All it is "New document ▾" and opens the five kinds, each
 * with a line on what it is for.
 */
export default function NewDocumentButton({ kind, onNew }: { kind: BusinessDocKind | 'all'; onNew: (kind: BusinessDocKind) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        wrap.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (kind !== 'all') {
    return (
      <button type="button" className={btnPrimary} onClick={() => onNew(kind)}>
        <Key>
          <PlusIcon />
        </Key>
        New {KIND_NAMES[kind].toLowerCase()}
      </button>
    );
  }

  // Up and down move through the kinds, as in any menu.
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        className={btnPrimary}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Key>
          <PlusIcon />
        </Key>
        New document
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="New document"
          onKeyDown={onMenuKey}
          className="absolute left-0 top-full z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {KIND_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNew(k);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-orange-50 focus:bg-orange-50 focus:outline-none dark:hover:bg-slate-800 dark:focus:bg-slate-800"
            >
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{KIND_NAMES[k]}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{KIND_HINTS[k]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
