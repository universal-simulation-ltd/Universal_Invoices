import { useEffect, useId, useRef, useState } from 'react';
import { DATE_PRESETS, isSet, presetOf, presetRange, rangeLabel, type DateRange } from '../lib/dateRange';
import { btnGhost, inputCls, labelCls } from './ui';

/**
 * The calendar on the end of Documents' search box (James, 2026-11-16: "have
 * a way to filter by date also, maybe a calendar icon attached to the search
 * box"): quick picks, or a from / to of your own. Orange while a range is on.
 */
export function DateFilterButton({ range, onChange }: { range: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useId();
  const on = isSet(range);
  const preset = presetOf(range);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${
      active
        ? 'border-orange-500 bg-orange-50 font-medium text-orange-800 dark:bg-orange-950/40 dark:text-orange-300'
        : 'border-slate-300 text-slate-700 hover:border-orange-400 dark:border-slate-700 dark:text-slate-300'
    }`;
  return (
    <div ref={wrap} className="absolute inset-y-0 right-0 flex items-center">
      <button
        type="button"
        className={`flex h-full w-10 items-center justify-center rounded-r-[inherit] ${on ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
        aria-label={on ? `Dates: ${rangeLabel(range)}` : 'Filter by date'}
        title={on ? rangeLabel(range) : 'Filter by date'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
          {on && <circle cx="12" cy="15.2" r="2" fill="currentColor" stroke="none" />}
        </svg>
      </button>
      {open && (
        <div
          id={panel}
          role="dialog"
          aria-label="Filter by date"
          className="absolute right-0 top-full z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={chip(preset === p.value)}
                aria-pressed={preset === p.value}
                onClick={() => {
                  onChange(preset === p.value ? {} : presetRange(p.value));
                  setOpen(false);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0">
              <span className={labelCls}>From</span>
              <input type="date" className={inputCls} value={range.from ?? ''} max={range.to} onChange={(e) => onChange({ ...range, from: e.target.value || undefined })} />
            </label>
            <label className="block min-w-0">
              <span className={labelCls}>To</span>
              <input type="date" className={inputCls} value={range.to ?? ''} min={range.from} onChange={(e) => onChange({ ...range, to: e.target.value || undefined })} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            {on && (
              <button type="button" className={`${btnGhost} u-btn--sm`} onClick={() => onChange({})}>
                Any date
              </button>
            )}
            <button type="button" className={`${btnGhost} u-btn--sm`} onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The range in force, beside the search box, with a × to clear it. */
export function DateFilterChip({ range, onClear }: { range: DateRange; onClear: () => void }) {
  if (!isSet(range)) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-50 py-1 pl-3 pr-1 text-sm text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
      {rangeLabel(range)}
      <button type="button" className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-orange-100 dark:hover:bg-orange-900/50" aria-label="Show any date" onClick={onClear}>
        ×
      </button>
    </span>
  );
}
