import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BUSINESS_PAGE, businessLineRows, businessSections, layoutBusinessDoc, type BusinessSection, type LayoutPage, type LineRowBox, type SectionBox } from '@unisim/doc';
import { changedBoxes } from '../lib/changes';

const PAD = 4; // points around a part's box
const PART_NAMES: Record<BusinessSection, string> = { issuer: 'From', document: 'Document', client: 'Client', lines: 'Lines', totals: 'Totals', notes: 'Notes', payment: 'Payment details', terms: 'Payment details', signature: 'Signature' };
import { toBusinessDoc } from '../lib/convert';
import { renderPdf } from '../lib/pdf';
import type { InvoiceDoc } from '../lib/types';

/**
 * The document's real PDF, drawn page by page with pdf.js rather than in the
 * browser's own viewer, so the part a form section fills in can be pointed at
 * (James, 2026-11-03: "when working / mouse hover on a section could it
 * highlight that section on the pdf previewer … equally, it autoscrolls to
 * that section"). The boxes come from the layout itself (@unisim/doc
 * `businessSections`), so they sit exactly on what they mark. What is drawn is
 * the same `renderPdf` the download is — the PDF is never a second copy.
 *
 * After a save, what changed flashes once the new pages are up, scrolled into
 * view if it is not (lib/changes.ts).
 */
export default function PdfPreview({
  doc,
  highlight,
  file,
  hovered,
  onHover,
  onPick,
  lines,
  parts,
}: {
  doc: InvoiceDoc;
  /** Marked and scrolled to: the part of the form being worked in. */
  highlight: BusinessSection[] | null;
  /** The signed copy, shown instead while it is current. */
  file?: Blob;
  /** Marked, never scrolled to: what the pointer is over on the preview itself. */
  hovered?: BusinessSection[] | null;
  /** The part of the page under the pointer (James, 2026-11-03: "on the viewer on hover highlight a section and on click open that collapsible"). */
  onHover?: (part: BusinessSection | null) => void;
  onPick?: (part: BusinessSection) => void;
  /**
   * Editing lines on the page itself (James, 2026-11-10: "edit directly onto
   * the PDF preview"): a row of the table is outlined under the pointer, a
   * click opens `editor` on it, and `add` sits under the table's last row.
   * Off while a signed copy is shown: that PDF is not this layout.
   */
  lines?: {
    open: number | null;
    onOpen: (line: number | null) => void;
    editor: ReactNode;
    add: ReactNode;
    /** The cursor left the open editor: save it, so the page redraws. */
    onLeave?: () => void;
    /** A row dragged to slot `to` (0 = above the first row, `n` = under the last). */
    onMoveTo?: (from: number, to: number) => void;
  };
  /**
   * The rest of the page edited the same way (James's backlog, 2026-11-10:
   * "parties, dates and notes on the page, the same way as lines"): a click on
   * one of `editable` opens `editor` under it instead of `onPick`.
   */
  parts?: { editable: BusinessSection[]; open: BusinessSection | null; onOpen: (part: BusinessSection | null) => void; editor: ReactNode; onLeave?: () => void };
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState<{ src: string; count: number; dropped: string[]; url: string } | null>(null);

  // The pane's width, so pages are drawn sharp at whatever size it is.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const result = useMemo(() => (file ? { blob: file, dropped: [] as string[] } : renderPdf(doc)), [doc, file]);
  const layout = useMemo(() => layoutBusinessDoc(toBusinessDoc(doc)), [doc]);
  const boxes = useMemo(() => businessSections(layout), [layout]);
  const rows = useMemo(() => businessLineRows(layout), [layout]);
  const lineEdit = file ? undefined : lines;
  const partEdit = file ? undefined : parts;
  // The part whose editor is open: the box that was clicked (the company's
  // details print at the top and again in the footer), else its first.
  const [clicked, setClicked] = useState<{ section: BusinessSection; page: number; top: number } | null>(null);
  const openPart = partEdit?.open
    ? (boxes.find((b) => clicked && b.section === partEdit.open && b.section === clicked.section && b.page === clicked.page && Math.abs(b.top - clicked.top) < 1) ??
      boxes.find((b) => b.section === partEdit.open))
    : undefined;
  const [overRow, setOverRow] = useState<number | null>(null);
  const card = useRef<HTMLDivElement>(null);
  // An editor just opened on a row or a part: on view, inside the pane.
  useEffect(() => {
    if (lineEdit?.open == null && partEdit?.open == null) return;
    const t = setTimeout(() => card.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    return () => clearTimeout(t);
  }, [lineEdit?.open, partEdit?.open]);

  // Dragging a row to reorder it: a mouse drags once it has moved a few
  // pixels; a finger holds still for a moment first, so a swipe still scrolls
  // (BRANDING.md: hold + move drags where reorderable).
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const press = useRef<{ line: number; x: number; y: number; touch: boolean; timer?: ReturnType<typeof setTimeout>; started: boolean } | null>(null);
  const swallowClick = useRef(false);
  const dragging = useRef(false);
  dragging.current = !!drag;
  // While a finger drags, the pane must not scroll under it.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (dragging.current) e.preventDefault();
    };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  // The same document laid out again: what changed waits for its pages to be drawn.
  const before = useRef<{ id: string; layout: LayoutPage[] } | null>(null);
  const pending = useRef<SectionBox[] | null>(null);
  const [flash, setFlash] = useState<{ boxes: SectionBox[]; fading: boolean; at: number } | null>(null);
  useEffect(() => {
    const was = before.current;
    before.current = { id: doc.id, layout };
    if (!was || was.id !== doc.id || file) return;
    const changed = changedBoxes(was.layout, layout);
    pending.current = changed.length ? changed : null;
  }, [layout, doc.id, file]);

  useEffect(() => {
    if (!width) return;
    let gone = false;
    const urls: string[] = [];
    const t = setTimeout(async () => {
      const { openPdf } = await import('../lib/pdfText');
      const bytes = new Uint8Array(await result.blob.arrayBuffer());
      const pdf = await openPdf(bytes);
      try {
        const scale = (width * Math.min(2, window.devicePixelRatio || 1)) / BUSINESS_PAGE.width;
        const srcs: string[] = [];
        for (let n = 1; n <= pdf.numPages && !gone; n++) {
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
          const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r));
          if (blob) srcs.push(URL.createObjectURL(blob));
          page.cleanup();
        }
        urls.push(...srcs);
        if (!gone) {
          // Swapped in whole, so the old pages stay up until the new ones are ready — no flicker.
          setPages((old) => {
            old?.src.split('\n').forEach((u) => URL.revokeObjectURL(u));
            if (old) URL.revokeObjectURL(old.url);
            return { src: srcs.join('\n'), count: pdf.numPages, dropped: result.dropped, url: URL.createObjectURL(result.blob) };
          });
          if (pending.current) {
            setFlash({ boxes: pending.current, fading: false, at: Date.now() });
            pending.current = null;
          }
        } else srcs.forEach((u) => URL.revokeObjectURL(u));
      } finally {
        await pdf.destroy();
      }
    }, 80);
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [result, width]);

  // The highlighted part in view: scrolled inside the pane, never the page.
  const marks = highlight ? boxes.filter((b) => highlight.includes(b.section)) : [];
  const first = marks[0];
  const pointedAt = hovered && !drag ? boxes.filter((b) => hovered.includes(b.section) && !marks.includes(b) && b !== openPart) : [];
  // The part under the pointer on page `i`, in points from the page's top left.
  const boxAt = (i: number, e: React.MouseEvent<HTMLDivElement>): SectionBox | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const scale = r.width / BUSINESS_PAGE.width;
    const x = (e.clientX - r.left) / scale;
    const y = (e.clientY - r.top) / scale;
    return boxes.find((b) => b.page === i && x >= b.x - PAD && x <= b.x + b.width + PAD && y >= b.top - PAD && y <= b.top + b.height + PAD) ?? null;
  };
  const partAt = (i: number, e: React.MouseEvent<HTMLDivElement>): BusinessSection | null => boxAt(i, e)?.section ?? null;
  // The table row under the pointer on page `i`.
  const rowAt = (i: number, e: React.MouseEvent<HTMLDivElement>): LineRowBox | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const scale = r.width / BUSINESS_PAGE.width;
    const x = (e.clientX - r.left) / scale;
    const y = (e.clientY - r.top) / scale;
    return rows.find((b) => b.page === i && x >= b.x && x <= b.x + b.width && y >= b.top && y <= b.top + b.height) ?? null;
  };
  // The slot a dragged row would drop into, from where the pointer is on screen.
  const slotAt = (clientX: number, clientY: number): number | null => {
    for (let i = 0; i < pageEls.current.length; i++) {
      const el = pageEls.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY < r.top || clientY > r.bottom || clientX < r.left - 40 || clientX > r.right + 40) continue;
      const y = (clientY - r.top) / (r.width / BUSINESS_PAGE.width);
      const here = rows.filter((b) => b.page === i);
      if (!here.length) return null;
      const below = here.find((b) => y < b.top + b.height / 2);
      return below ? below.line : here[here.length - 1].line + 1;
    }
    return null;
  };
  const startDrag = (line: number) => {
    press.current!.started = true;
    lineEdit?.onLeave?.();
    setOverRow(null);
    setDrag({ from: line, to: line });
  };
  const endPress = () => {
    if (press.current?.timer) clearTimeout(press.current.timer);
    press.current = null;
  };
  const onPointerDown = (i: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (!lineEdit?.onMoveTo || e.button !== 0) return;
    const row = rowAt(i, e);
    if (!row) return;
    const touch = e.pointerType === 'touch';
    press.current = { line: row.line, x: e.clientX, y: e.clientY, touch, started: false };
    if (touch) {
      press.current.timer = setTimeout(() => {
        if (!press.current) return;
        navigator.vibrate?.(10);
        startDrag(row.line);
      }, 450);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p) return;
    const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (!p.started) {
      // A finger that moves before the hold is a scroll; a mouse that moves is a drag.
      if (p.touch) {
        if (moved > 8) endPress();
        return;
      }
      if (moved < 5) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      startDrag(p.line);
    }
    const to = slotAt(e.clientX, e.clientY);
    if (to !== null) setDrag((d) => (d && d.to !== to ? { ...d, to } : d));
    // Near the pane's top or bottom edge, it scrolls along.
    const el = scroller.current;
    if (el) {
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + 48) el.scrollBy({ top: -16 });
      else if (e.clientY > r.bottom - 48) el.scrollBy({ top: 16 });
    }
  };
  const onPointerUp = () => {
    const p = press.current;
    endPress();
    if (!p?.started || !drag) return;
    swallowClick.current = true;
    setTimeout(() => (swallowClick.current = false), 0);
    const { from, to } = drag;
    setDrag(null);
    if (to !== from && to !== from + 1) lineEdit?.onMoveTo?.(from, to);
  };
  const onPointerCancel = () => {
    endPress();
    setDrag(null);
  };
  // Where the dropped row would land: a bar on the slot's edge.
  const dropBar = (() => {
    if (!drag || drag.to === drag.from || drag.to === drag.from + 1) return null;
    const next = rows.find((r) => r.line === drag.to);
    if (next) return { page: next.page, x: next.x, top: next.top, width: next.width };
    const last = rows.find((r) => r.line === drag.to - 1);
    return last ? { page: last.page, x: last.x, top: last.top + last.height, width: last.width } : null;
  })();

  // Where "+ Add line" goes: under the last row, or under the table's header when there are none.
  const lastRow = rows[rows.length - 1];
  const header = boxes.find((b) => b.section === 'lines');
  const addAt = lastRow
    ? { page: lastRow.page, x: lastRow.x, top: lastRow.top + lastRow.height }
    : header
      ? { page: header.page, x: header.x, top: header.top + header.height }
      : null;
  useEffect(() => {
    const el = scroller.current;
    if (!el || !first || !width) return;
    const pageH = (width * BUSINESS_PAGE.height) / BUSINESS_PAGE.width;
    const gap = 12;
    const top = first.page * (pageH + gap) + (first.top / BUSINESS_PAGE.height) * pageH;
    el.scrollTo({ top: Math.max(0, top - el.clientHeight / 4), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new section (or page), not every re-render
  }, [first?.section, first?.page, first?.top, width]);

  // The flash: on view if it is not already, then fading out.
  useEffect(() => {
    const el = scroller.current;
    const top = flash?.boxes[0];
    if (!flash || !el || !top || !width) return;
    const pageH = (width * BUSINESS_PAGE.height) / BUSINESS_PAGE.width;
    const gap = 12;
    const y = top.page * (pageH + gap) + (top.top / BUSINESS_PAGE.height) * pageH;
    const h = (top.height / BUSINESS_PAGE.height) * pageH;
    if (y < el.scrollTop || y + h > el.scrollTop + el.clientHeight) el.scrollTo({ top: Math.max(0, y - el.clientHeight / 3), behavior: 'smooth' });
    const fade = setTimeout(() => setFlash((f) => (f && f.at === flash.at ? { ...f, fading: true } : f)), 1400);
    const gone = setTimeout(() => setFlash((f) => (f && f.at === flash.at ? null : f)), 2200);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per flash
  }, [flash?.at]);

  const srcs = pages?.src.split('\n') ?? [];
  const k = width / BUSINESS_PAGE.width;
  return (
    <>
      <div
        ref={scroller}
        className="h-[75vh] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-200/60 p-0 lg:h-[calc(100vh-7rem)] dark:border-slate-800 dark:bg-slate-800/60"
      >
        {pages ? (
          srcs.map((src, i) => (
            <div
              key={i}
              ref={(el) => {
                pageEls.current[i] = el;
              }}
              className={`relative select-none bg-white shadow-sm [-webkit-touch-callout:none] ${drag ? 'cursor-grabbing' : hovered?.length || overRow !== null ? 'cursor-pointer' : ''}`}
              onMouseMove={(e) => {
                if (drag) return;
                onHover?.(partAt(i, e));
                if (lineEdit) setOverRow(rowAt(i, e)?.line ?? null);
              }}
              onMouseLeave={() => {
                onHover?.(null);
                setOverRow(null);
              }}
              onPointerDown={(e) => onPointerDown(i, e)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onContextMenu={(e) => {
                if (press.current?.touch) e.preventDefault();
              }}
              onClick={(e) => {
                if (swallowClick.current) return;
                const row = lineEdit && rowAt(i, e);
                if (row) {
                  lineEdit.onOpen(row.line === lineEdit.open ? null : row.line);
                  return;
                }
                const hit = boxAt(i, e);
                const part = hit?.section ?? null;
                if (hit && part && partEdit?.editable.includes(part)) {
                  setClicked({ section: part, page: hit.page, top: hit.top });
                  partEdit.onOpen(part === partEdit.open ? null : part);
                  return;
                }
                if (part && onPick) onPick(part);
              }}
            >
              <img src={src} alt={`Page ${i + 1}`} className="block w-full" draggable={false} />
              {lineEdit &&
                rows
                  .filter((r) => r.page === i && (drag ? r.line === drag.from : r.line === overRow || r.line === lineEdit.open))
                  .map((r) => (
                    <div
                      key={`row-${r.line}`}
                      aria-hidden
                      className={`pointer-events-none absolute rounded-sm ring-2 ${
                        drag ? 'bg-slate-400/20 outline-dashed outline-2 outline-slate-500 ring-0' : r.line === lineEdit.open ? 'bg-orange-400/15 ring-orange-500' : 'bg-orange-400/5 ring-orange-400/60'
                      }`}
                      style={{ left: r.x * k, top: r.top * k, width: r.width * k, height: r.height * k }}
                    >
                      {!drag && r.line !== lineEdit.open && (
                        <span className="absolute -top-2 right-1 -translate-y-full rounded-full bg-orange-600 px-1.5 py-px text-[10px] font-semibold text-white shadow-sm">
                          {lineEdit.onMoveTo && rows.length > 1 ? 'Click to edit · drag to move' : 'Click to edit'}
                        </span>
                      )}
                    </div>
                  ))}
              {dropBar?.page === i && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute z-10 h-[3px] -translate-y-1/2 rounded-full bg-orange-600 shadow"
                  style={{ left: dropBar.x * k - 4, top: dropBar.top * k, width: dropBar.width * k + 8 }}
                />
              )}
              {lineEdit &&
                !drag &&
                rows
                  .filter((r) => r.page === i && r.line === lineEdit.open)
                  .map((r) => (
                    <EditCard
                      key={`edit-${r.line}`}
                      cardRef={card}
                      label={`Line ${r.line + 1}`}
                      style={{ left: Math.max(4, r.x * k - 8), top: (r.top + r.height) * k + 6, width: Math.min(width - 8, r.width * k + 16) }}
                      onClose={() => lineEdit.onOpen(null)}
                      onLeave={lineEdit.onLeave}
                      onOver={() => setOverRow(null)}
                    >
                      {lineEdit.editor}
                    </EditCard>
                  ))}
              {openPart?.page === i && partEdit && (
                <>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute rounded-md bg-orange-400/15 ring-2 ring-orange-500"
                    style={{ left: (openPart.x - PAD) * k, top: (openPart.top - PAD) * k, width: (openPart.width + 2 * PAD) * k, height: (openPart.height + 2 * PAD) * k }}
                  />
                  <EditCard
                    cardRef={card}
                    label={PART_NAMES[openPart.section]}
                    style={(() => {
                      const w = Math.min(width - 8, Math.max(openPart.width * k + 16, 420));
                      return { left: Math.min(Math.max(4, openPart.x * k - 8), width - w - 4), top: (openPart.top + openPart.height + PAD) * k + 6, width: w };
                    })()}
                    onClose={() => partEdit.onOpen(null)}
                    onLeave={partEdit.onLeave}
                    onOver={() => {
                      setOverRow(null);
                      onHover?.(null);
                    }}
                  >
                    {partEdit.editor}
                  </EditCard>
                </>
              )}
              {lineEdit && lineEdit.open === null && !partEdit?.open && !drag && addAt?.page === i && (
                <div
                  className="absolute z-10 flex flex-wrap items-center gap-2"
                  style={{ left: addAt.x * k, top: addAt.top * k + 6 }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseMove={(e) => {
                    e.stopPropagation();
                    setOverRow(null);
                  }}
                >
                  {lineEdit.add}
                </div>
              )}
              {marks
                .filter((b) => b.page === i)
                .map((b, n) => (
                  <div
                    key={`${b.section}-${n}`}
                    aria-hidden
                    className="pointer-events-none absolute rounded-md bg-orange-400/15 ring-2 ring-orange-500/70 transition-opacity"
                    style={{ left: (b.x - PAD) * k, top: (b.top - PAD) * k, width: (b.width + 2 * PAD) * k, height: (b.height + 2 * PAD) * k }}
                  />
                ))}
              {pointedAt
                .filter((b) => b.page === i)
                .map((b, n) => (
                  <div
                    key={`over-${b.section}-${n}`}
                    aria-hidden
                    className="pointer-events-none absolute rounded-md bg-orange-400/10 ring-2 ring-orange-400/60"
                    style={{ left: (b.x - PAD) * k, top: (b.top - PAD) * k, width: (b.width + 2 * PAD) * k, height: (b.height + 2 * PAD) * k }}
                  >
                    {n === 0 && overRow === null && partEdit?.editable.includes(b.section) && b.section !== partEdit.open && (
                      <span className="absolute -top-1 right-1 -translate-y-full rounded-full bg-orange-600 px-1.5 py-px text-[10px] font-semibold text-white shadow-sm">Click to edit</span>
                    )}
                  </div>
                ))}
              {flash?.boxes
                .filter((b) => b.page === i)
                .map((b, n) => (
                  <div
                    key={`flash-${flash.at}-${n}`}
                    aria-hidden
                    className={`pointer-events-none absolute rounded bg-emerald-400/25 ring-2 ring-emerald-500 transition-opacity duration-700 ${flash.fading ? 'opacity-0' : 'opacity-100'}`}
                    style={{ left: (b.x - PAD) * k, top: (b.top - PAD / 2) * k, width: (b.width + 2 * PAD) * k, height: (b.height + PAD) * k }}
                  >
                    {n === 0 && b === flash.boxes[0] && <span className="absolute bottom-full right-0 mb-1 rounded-full bg-emerald-600 px-1.5 py-px text-[10px] font-semibold text-white shadow-sm">Updated</span>}
                  </div>
                ))}
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Preparing the preview…</div>
        )}
      </div>
      <span className="sr-only" role="status">
        {flash ? 'The preview has updated.' : ''}
      </span>
      {pages && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {pages.count} page{pages.count === 1 ? '' : 's'} · made in this browser, nothing uploaded ·{' '}
          <a href={pages.url} target="_blank" rel="noreferrer" className="font-medium text-orange-700 hover:underline dark:text-orange-400">
            Open full size
          </a>
          {pages.dropped.length > 0 && (
            <span className="ml-2 font-medium text-red-700 dark:text-red-400">These characters cannot be printed and show as “?”: {pages.dropped.join(' ')}</span>
          )}
        </p>
      )}
    </>
  );
}

/**
 * The editor that opens on the page under a row or a part: Escape closes it,
 * and the cursor leaving it saves (the page redraws), as leaving a box in the
 * form does.
 */
function EditCard({
  cardRef,
  label,
  style,
  onClose,
  onLeave,
  onOver,
  children,
}: {
  cardRef: React.RefObject<HTMLDivElement>;
  label: string;
  style: React.CSSProperties;
  onClose: () => void;
  onLeave?: () => void;
  /** The pointer is over the card, not the page under it. */
  onOver: () => void;
  children: ReactNode;
}) {
  // Opened: the cursor goes in, so typing and Escape work straight away.
  useEffect(() => {
    const el = cardRef.current;
    if (!el || el.contains(document.activeElement)) return;
    const first = el.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select');
    (first ?? el).focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when it opens
  }, [label]);
  return (
    <div
      ref={cardRef}
      role="group"
      tabIndex={-1}
      aria-label={label}
      className="absolute z-10 select-text rounded-xl outline-none border border-orange-300 bg-white p-3 text-left shadow-xl dark:border-orange-800 dark:bg-slate-900"
      style={style}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => {
        e.stopPropagation();
        onOver();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onLeave?.();
      }}
    >
      {children}
    </div>
  );
}
