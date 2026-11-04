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
  const press = useRef<{ tab: Tab; id: number; x: number; y: number; mouse: boolean; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const dragging = useRef(false);
  /** The click that ends a drag is not a tap. */
  const swallow = useRef(false);
  const tabs = drag?.order ?? order;

  const pickUp = (t: Tab) => {
    dragging.current = true;
    // Only now, mouse or finger: from here the bar hears the pointer even off
    // the bar, so letting go anywhere ends the drag. Not at pointerdown — a
    // pointer captured to the bar makes a plain click land on the bar, not the tab.
    try {
      if (press.current) nav.current?.setPointerCapture(press.current.id);
    } catch {
      /* the pointer has already gone */
    }
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

  // Move and let go are heard on the BAR, which the pointer is captured to: a
  // tab's own button is re-inserted when it moves right past another (React
  // moves the node), and a captured node that moves loses the capture — so
  // a tab dragged right used to stop after one place.
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p) return;
    if (!dragging.current) {
      const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y) > (p.mouse ? 5 : SLOP);
      if (!moved) return;
      if (p.mouse) pickUp(p.tab);
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
  };
  const onUp = () => {
    if (dragging.current) {
      swallow.current = true;
      if (drag && drag.order.join() !== order.join()) onOrder(drag.order);
    }
    end();
  };

  const handlers = (t: Tab) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      swallow.current = false;
      const mouse = e.pointerType === 'mouse';
      // No capture yet: a plain click must still land on the tab. pickUp captures.
      press.current = { tab: t, id: e.pointerId, x: e.clientX, y: e.clientY, mouse, timer: mouse ? undefined : setTimeout(() => pickUp(t), HOLD_MS) };
    },
    // A held finger would otherwise bring up the browser's menu.
    onContextMenu: (e: React.MouseEvent) => {
      if (press.current && !press.current.mouse) e.preventDefault();
    },
  });

  return (
    <nav
      ref={nav}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={end}
      className="u-tabs mb-5"
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
          // The suite's tray tabs (SDK 0.216, BRANDING.md → Tabs): aria-current
          // selects, and buttonProps' data-default-view draws the opens-here dot.
          className={`u-tab ${drag?.tab === t ? 'cursor-grabbing opacity-50' : ''}`}
        >
          {tabLabel(t)}
        </button>
      ))}
    </nav>
  );
}
