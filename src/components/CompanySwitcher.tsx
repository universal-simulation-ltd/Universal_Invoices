import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Company } from '../lib/types';

/** A company's logo, or its first letter on a tile when it has none. */
function Logo({ company, size }: { company: Company; size: 'sm' | 'md' }) {
  const box = size === 'md' ? 'h-9 w-14' : 'h-7 w-11';
  if (company.logo) return <img src={company.logo.dataUrl} alt="" className={`${box} shrink-0 object-contain`} />;
  return (
    <span aria-hidden className={`${box} flex shrink-0 items-center justify-center rounded-md bg-orange-100 text-sm font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-300`}>
      {(company.name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

/**
 * Which company Documents shows, by its logo (James, 2026-11-04: "use the
 * company logo somewhere so they know what company is active and on click
 * show the list of companies with logos"). Picking one makes it the active
 * company, as Your companies' "Make active" does; adding or editing one is
 * still Your companies'.
 */
export default function CompanySwitcher({
  companies,
  active,
  others,
  orphans,
  onPick,
  onOthers,
  onManage,
}: {
  companies: Company[];
  active: Company;
  /** Showing the documents of deleted companies instead. */
  others: boolean;
  orphans: number;
  onPick: (id: string) => void;
  onOthers: () => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Sideways nudge that keeps the open list on the page: it hangs from the
  // trigger's left edge, which near the right of the toolbar runs off it.
  const shift = useRef(0);

  useLayoutEffect(() => {
    if (!open) return;
    shift.current = 0; // a fresh list, not yet nudged
    const place = () => {
      const el = menu.current;
      if (!el) return;
      const gutter = 16;
      // Where it would sit unnudged, then the nudge that brings it inside.
      const left = el.getBoundingClientRect().left - shift.current;
      const right = left + el.offsetWidth;
      const page = document.documentElement.clientWidth;
      shift.current = right > page - gutter ? Math.max(gutter - left, page - gutter - right) : left < gutter ? gutter - left : 0;
      el.style.transform = shift.current ? `translateX(${shift.current}px)` : '';
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"], [role^="menuitem"]')?.focus();
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

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };
  const pick = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800';
  const name = (c: Company) => c.name || 'Unnamed company';

  return (
    <div ref={wrap} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={others ? 'From deleted companies' : name(active)}
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        {!others && <Logo company={active} size="sm" />}
        <span className="min-w-0 leading-tight">
          {/* A long name ends in "…" rather than pushing the toolbar about. */}
          <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200" style={{ maxWidth: '14rem' }}>
            {others ? 'From deleted companies' : name(active)}
          </span>
          <span className="block text-xs text-slate-500 underline dark:text-slate-400">Change company?</span>
        </span>
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Companies"
          onKeyDown={onMenuKey}
          className="absolute left-0 top-full z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {companies.map((c) => {
            const on = !others && c.id === active.id;
            return (
              <button key={c.id} type="button" role="menuitemradio" aria-checked={on} className={`${item} ${on ? 'bg-orange-50 dark:bg-orange-950/40' : ''}`} onClick={pick(() => onPick(c.id))}>
                <Logo company={c} size="md" />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-200">{name(c)}</span>
                {on && <span className="text-xs font-medium text-orange-700 dark:text-orange-400">Active</span>}
              </button>
            );
          })}
          {orphans > 0 && (
            <button type="button" role="menuitemradio" aria-checked={others} className={`${item} ${others ? 'bg-orange-50 dark:bg-orange-950/40' : ''}`} onClick={pick(onOthers)}>
              <span className="min-w-0 flex-1 text-slate-600 dark:text-slate-300">From deleted companies ({orphans})</span>
            </button>
          )}
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <button type="button" role="menuitem" className={`${item} text-slate-600 dark:text-slate-300`} onClick={pick(onManage)}>
            Add or edit companies in Your companies
          </button>
        </div>
      )}
    </div>
  );
}
