import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Target } from '../lib/arrange';

/**
 * Drag a row by its handle to a new place (the catalogue's folders and order,
 * lib/arrange.ts). Pointer events, not HTML5 drag and drop: the same code
 * works with a mouse, a finger and a pen, and it never collides with dropping
 * picture FILES on a row, which the list already does.
 *
 * Rows say what they are with data attributes, and the pointer's position
 * over one picks the landing place:
 * - `data-drop="item"` — a product row: its top half drops above it, the
 *   bottom half below.
 * - `data-drop="folder"` — a folder's heading: its top third drops above the
 *   folder; the rest drops INTO it.
 * - `data-drop="into"` — an empty folder's "drag products here".
 * - `data-top` — a top-level block (a folder with its products, or a loose
 *   product): what a dragged FOLDER lands above or below, since folders do
 *   not nest.
 *
 * Keyboard: the handle is a button; ↑ and ↓ move the row one place.
 */
export interface DragState {
  id: string;
  kind: 'folder' | 'item';
  target: Target | null;
}

export function useArrangeDrag({
  levels,
  open,
  onMove,
  onStep,
}: {
  /** Each level's ids in order: `null` the top, else a folder's id. */
  levels: Map<string | null, string[]>;
  /** Whether a folder is showing its products. */
  open: (folderId: string) => boolean;
  onMove: (id: string, target: Target) => void;
  onStep: (id: string, dir: -1 | 1) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const live = useRef({ levels, open, drag, y: 0 });
  live.current = { ...live.current, levels, open, drag };

  /** The id after `id` in its level, for "below this one". */
  const after = (parent: string | null, id: string) => {
    const ids = live.current.levels.get(parent) ?? [];
    return ids[ids.indexOf(id) + 1] ?? null;
  };

  function targetAt(x: number, y: number, kind: DragState['kind']): Target | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;
    if (kind === 'folder') {
      const top = el.closest<HTMLElement>('[data-top]');
      if (!top) return null;
      const id = top.dataset.top!;
      const r = top.getBoundingClientRect();
      return { parent: null, before: y < r.top + r.height / 2 ? id : after(null, id) };
    }
    const row = el.closest<HTMLElement>('[data-drop]');
    if (!row) return null;
    const id = row.dataset.id!;
    const r = row.getBoundingClientRect();
    if (row.dataset.drop === 'into') return { parent: id, before: null };
    if (row.dataset.drop === 'folder') {
      if (y < r.top + r.height / 3) return { parent: null, before: id };
      // Open: just under the heading, where the line shows. Closed: at the end.
      return { parent: id, before: live.current.open(id) ? (live.current.levels.get(id)?.[0] ?? null) : null };
    }
    const parent = row.dataset.parent || null;
    return { parent, before: y < r.top + r.height / 2 ? id : after(parent, id) };
  }

  // Esc cancels; near the window's top or bottom edge the page scrolls.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setDrag(null);
    };
    let frame = 0;
    const tick = () => {
      const { y } = live.current;
      const edge = 72;
      if (y < edge) window.scrollBy(0, -Math.ceil((edge - y) / 6));
      else if (y > window.innerHeight - edge) window.scrollBy(0, Math.ceil((y - window.innerHeight + edge) / 6));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [dragging]);

  /** Spread on a row's handle. */
  const handle = (id: string, kind: DragState['kind']) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      live.current.y = e.clientY;
      setDrag({ id, kind, target: null });
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = live.current.drag;
      if (!d || d.id !== id) return;
      live.current.y = e.clientY;
      const target = targetAt(e.clientX, e.clientY, kind);
      // Between rows (a gap, the margin) keeps the last landing place.
      if (target && (target.parent !== d.target?.parent || target.before !== d.target?.before)) setDrag({ ...d, target });
    },
    onPointerUp: () => {
      const d = live.current.drag;
      setDrag(null);
      if (d?.target) onMove(d.id, d.target);
    },
    onPointerCancel: () => setDrag(null),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      onStep(id, e.key === 'ArrowUp' ? -1 : 1);
    },
  });

  return { drag, handle };
}

/** The six-dot grip. */
export function DragHandle({ label, disabled, ...props }: { label: string; disabled?: boolean } & ReturnType<ReturnType<typeof useArrangeDrag>['handle']>) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled}
      aria-label={label}
      title={`${label} — drag, or use the ↑ ↓ keys`}
      className="flex w-6 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800"
    >
      <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" fill="currentColor">
        {[2, 8, 14].flatMap((cy) => [<circle key={`a${cy}`} cx="2.5" cy={cy} r="1.5" />, <circle key={`b${cy}`} cx="7.5" cy={cy} r="1.5" />])}
      </svg>
    </button>
  );
}

/** Where the dragged row will land — and, when several go together, how many. */
export function DropLine({ label }: { label?: string }) {
  if (!label) return <div className="mx-1 h-1 rounded-full bg-orange-500" aria-hidden="true" />;
  return (
    <div className="mx-1 flex items-center gap-2" aria-hidden="true">
      <div className="h-1 flex-1 rounded-full bg-orange-500" />
      <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-semibold text-white">{label}</span>
      <div className="h-1 flex-1 rounded-full bg-orange-500" />
    </div>
  );
}
