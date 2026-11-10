import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BUSINESS_PAGE, businessLineRows, businessSections, layoutBusinessDoc, type BusinessSection, type LayoutPage, type LineRowBox, type SectionBox } from '@unisim/doc';
import { changedBoxes } from '../lib/changes';

const PAD = 4; // points around a part's box
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
  lines?: { open: number | null; onOpen: (line: number | null) => void; editor: ReactNode; add: ReactNode; /** The cursor left the open editor: save it, so the page redraws. */ onLeave?: () => void };
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
  const [overRow, setOverRow] = useState<number | null>(null);
  const card = useRef<HTMLDivElement>(null);
  // An editor just opened on a row: on view, inside the pane.
  useEffect(() => {
    if (lineEdit?.open == null) return;
    const t = setTimeout(() => card.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    return () => clearTimeout(t);
  }, [lineEdit?.open]);

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
  const pointedAt = hovered ? boxes.filter((b) => hovered.includes(b.section) && !marks.includes(b)) : [];
  // The part under the pointer on page `i`, in points from the page's top left.
  const partAt = (i: number, e: React.MouseEvent<HTMLDivElement>): BusinessSection | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const scale = r.width / BUSINESS_PAGE.width;
    const x = (e.clientX - r.left) / scale;
    const y = (e.clientY - r.top) / scale;
    return boxes.find((b) => b.page === i && x >= b.x - PAD && x <= b.x + b.width + PAD && y >= b.top - PAD && y <= b.top + b.height + PAD)?.section ?? null;
  };
  // The table row under the pointer on page `i`.
  const rowAt = (i: number, e: React.MouseEvent<HTMLDivElement>): LineRowBox | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const scale = r.width / BUSINESS_PAGE.width;
    const x = (e.clientX - r.left) / scale;
    const y = (e.clientY - r.top) / scale;
    return rows.find((b) => b.page === i && x >= b.x && x <= b.x + b.width && y >= b.top && y <= b.top + b.height) ?? null;
  };
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
              className={`relative bg-white shadow-sm ${hovered?.length || overRow !== null ? 'cursor-pointer' : ''}`}
              onMouseMove={(e) => {
                onHover?.(partAt(i, e));
                if (lineEdit) setOverRow(rowAt(i, e)?.line ?? null);
              }}
              onMouseLeave={() => {
                onHover?.(null);
                setOverRow(null);
              }}
              onClick={(e) => {
                const row = lineEdit && rowAt(i, e);
                if (row) {
                  lineEdit.onOpen(row.line === lineEdit.open ? null : row.line);
                  return;
                }
                const part = partAt(i, e);
                if (part && onPick) onPick(part);
              }}
            >
              <img src={src} alt={`Page ${i + 1}`} className="block w-full" draggable={false} />
              {lineEdit &&
                rows
                  .filter((r) => r.page === i && (r.line === overRow || r.line === lineEdit.open))
                  .map((r) => (
                    <div
                      key={`row-${r.line}`}
                      aria-hidden
                      className={`pointer-events-none absolute rounded-sm ring-2 ${r.line === lineEdit.open ? 'bg-orange-400/15 ring-orange-500' : 'bg-orange-400/5 ring-orange-400/60'}`}
                      style={{ left: r.x * k, top: r.top * k, width: r.width * k, height: r.height * k }}
                    >
                      {r.line !== lineEdit.open && (
                        <span className="absolute -top-2 right-1 -translate-y-full rounded-full bg-orange-600 px-1.5 py-px text-[10px] font-semibold text-white shadow-sm">Click to edit</span>
                      )}
                    </div>
                  ))}
              {lineEdit &&
                rows
                  .filter((r) => r.page === i && r.line === lineEdit.open)
                  .map((r) => (
                    <div
                      key={`edit-${r.line}`}
                      ref={card}
                      role="group"
                      aria-label={`Line ${r.line + 1}`}
                      className="absolute z-10 rounded-xl border border-orange-300 bg-white p-3 text-left shadow-xl dark:border-orange-800 dark:bg-slate-900"
                      style={{ left: Math.max(4, r.x * k - 8), top: (r.top + r.height) * k + 6, width: Math.min(width - 8, r.width * k + 16) }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseMove={(e) => {
                        e.stopPropagation();
                        setOverRow(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') lineEdit.onOpen(null);
                      }}
                      onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) lineEdit.onLeave?.();
                      }}
                    >
                      {lineEdit.editor}
                    </div>
                  ))}
              {lineEdit && lineEdit.open === null && addAt?.page === i && (
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
                  />
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
