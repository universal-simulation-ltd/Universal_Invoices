import { useRef, useState, type PointerEvent } from 'react';
import { moveTab, tabLabel } from '../lib/tabs';
import type { Tab } from '../stores/appStore';

/**
 * Tune this app ▸ Tab order: the order the tab bar takes from a drag, for
 * anybody who cannot drag it there (the suite's tab rule). Each row has a
 * grip to drag (mouse or finger) and Move up / Move down buttons. Reset to
 * defaults puts it back. BlackBook's TabOrderPreference is the model.
 */
export default function TabOrderPreference({ order, onOrder }: { order: Tab[]; onOrder: (order: Tab[]) => void }) {
  const list = useRef<HTMLOListElement>(null);
  const [held, setHeld] = useState<Tab | null>(null);
  const move = (tab: Tab, to: number) => onOrder(moveTab(order, tab, to));

  const grip = (tab: Tab) => ({
    onPointerDown: (e: PointerEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setHeld(tab);
    },
    onPointerMove: (e: PointerEvent<HTMLSpanElement>) => {
      if (held !== tab) return;
      const rows = [...(list.current?.children ?? [])] as HTMLElement[];
      const at = rows.findIndex((r) => {
        const b = r.getBoundingClientRect();
        return e.clientY >= b.top && e.clientY <= b.bottom;
      });
      if (at >= 0 && order[at] !== tab) move(tab, at);
    },
    onPointerUp: () => setHeld(null),
    onPointerCancel: () => setHeld(null),
  });

  const arrow = 'h-9 w-9 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100';
  return (
    <fieldset className="py-2">
      <legend className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">Tab order</legend>
      <p className="mb-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">Drag a tab along the bar, or move it here.</p>
      <ol ref={list} className="space-y-1">
        {order.map((tab, i) => (
          <li
            key={tab}
            className={`flex min-h-[44px] items-center gap-2 rounded-lg border px-2 ${
              held === tab ? 'border-orange-500 bg-orange-500/10' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <span
              {...grip(tab)}
              aria-hidden
              className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor">
                {[2, 8, 14].flatMap((cy) => [<circle key={`a${cy}`} cx="2.5" cy={cy} r="1.5" />, <circle key={`b${cy}`} cx="7.5" cy={cy} r="1.5" />])}
              </svg>
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-200">{tabLabel(tab)}</span>
            <button type="button" className={arrow} aria-label={`Move ${tabLabel(tab)} up`} disabled={i === 0} onClick={() => move(tab, i - 1)}>
              ↑
            </button>
            <button type="button" className={arrow} aria-label={`Move ${tabLabel(tab)} down`} disabled={i === order.length - 1} onClick={() => move(tab, i + 1)}>
              ↓
            </button>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}
