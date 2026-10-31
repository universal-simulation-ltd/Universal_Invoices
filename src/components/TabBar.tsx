import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { useDefaultView } from '@unisim/sdk';
import { moveTab, tabLabel } from '../lib/tabs';
import type { Tab } from '../stores/appStore';

const HOLD_MS = 450;
/** A finger that moves this far before the hold is scrolling the bar, not picking a tab up. */
const SLOP = 8;

/**
 * The tabs, which drag into a new order (the suite's tab rule,
 * Docs_UNI_SIM/BRANDING.md ▸ Tabs reorder: hold and drag). A mouse picks a
 * tab up as soon as it moves; a finger or pen holds it first (~0.5 s, a light
 * buzz), so a quick swipe still scrolls the bar on a phone. While one is held
 * the bar shows where it would land, and letting go saves the order. A drag
 * is never a tap: the tab does not open, and a double tap still makes a tab
 * the one the app opens on. Tune this app ▸ Tab order is the way without a
 * pointer.
 */
export default function TabBar({
  order,
  onOrder,
  tab,
  onTab,
  homeTab,
}: {
  order: Tab[];
  onOrder: (order: Tab[]) => void;
  tab: Tab;
  onTab: (tab: Tab) => void;
  homeTab: ReturnType<typeof useDefaultView<Tab>>;
}) {
  const nav = useRef<HTMLElement>(null);
  const [drag, setDrag] = useState<{ tab: Tab; order: Tab[] } | null>(null);
  const press = useRef<{ tab: Tab; x: number; y: number; mouse: boolean; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const dragging = useRef(false);
  /** The click that ends a drag is not a tap. */
  const swallow = useRef(false);
  const tabs = drag?.order ?? order;

  const pickUp = (t: Tab) => {
    dragging.current = true;
    setDrag({ tab: t, order });
    navigator.vibrate?.(10);
  };
  const end = () => {
    if (press.current?.timer) clearTimeout(press.current.timer);
    press.current = null;
    dragging.current = false;
    setDrag(null);
  };

  // Once a finger has picked a tab up, the bar must not scroll under it. Only
  // a non-passive listener can stop that, and React's are passive.
  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (dragging.current && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag]);

  const handlers = (t: Tab) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      swallow.current = false;
      const mouse = e.pointerType === 'mouse';
      if (mouse) e.currentTarget.setPointerCapture(e.pointerId);
      press.current = { tab: t, x: e.clientX, y: e.clientY, mouse, timer: mouse ? undefined : setTimeout(() => pickUp(t), HOLD_MS) };
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      const p = press.current;
      if (!p || p.tab !== t) return;
      if (!dragging.current) {
        const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y) > (p.mouse ? 5 : SLOP);
        if (!moved) return;
        if (p.mouse) pickUp(t);
        else {
          // Moved before the hold: a scroll. Let it be.
          clearTimeout(p.timer);
          press.current = null;
          return;
        }
      }
      // Over another tab: this one takes its place.
      const over = [...(nav.current?.querySelectorAll<HTMLElement>('[data-tab]') ?? [])].find((b) => {
        const r = b.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right;
      });
      const to = over?.dataset.tab as Tab | undefined;
      setDrag((d) => (d && to && to !== d.tab ? { ...d, order: moveTab(d.order, d.tab, d.order.indexOf(to)) } : d));
    },
    onPointerUp: () => {
      if (dragging.current) {
        swallow.current = true;
        if (drag && drag.order.join() !== order.join()) onOrder(drag.order);
      }
      end();
    },
    onPointerCancel: end,
    // A held finger would otherwise bring up the browser's menu.
    onContextMenu: (e: React.MouseEvent) => {
      if (press.current && !press.current.mouse) e.preventDefault();
    },
  });

  return (
    <nav
      ref={nav}
      className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800/70"
      aria-label="Sections"
    >
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          data-tab={t}
          {...homeTab.buttonProps(t, tabLabel(t))}
          {...handlers(t)}
          onClick={() => {
            if (swallow.current) {
              swallow.current = false;
              return;
            }
            homeTab.tap(t);
            onTab(t);
          }}
          aria-current={tab === t ? 'page' : undefined}
          className={`shrink-0 select-none rounded-lg px-4 py-2 text-sm font-medium transition-colors [-webkit-touch-callout:none] data-[default-view=true]:ring-2 data-[default-view=true]:ring-orange-400 ${
            drag?.tab === t ? 'cursor-grabbing opacity-50 ring-2 ring-orange-500' : ''
          } ${
            tab === t
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          {tabLabel(t)}
        </button>
      ))}
    </nav>
  );
}
