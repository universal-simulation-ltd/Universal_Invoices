import { useEffect, useMemo, useRef, useState } from 'react';
import { BUSINESS_PAGE, businessSections, layoutBusinessDoc, type BusinessSection } from '@unisim/doc';
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
 */
export default function PdfPreview({ doc, highlight, file }: { doc: InvoiceDoc; highlight: BusinessSection[] | null; /** The signed copy, shown instead while it is current. */ file?: Blob }) {
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
  const boxes = useMemo(() => businessSections(layoutBusinessDoc(toBusinessDoc(doc))), [doc]);

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
  useEffect(() => {
    const el = scroller.current;
    if (!el || !first || !width) return;
    const pageH = (width * BUSINESS_PAGE.height) / BUSINESS_PAGE.width;
    const gap = 12;
    const top = first.page * (pageH + gap) + (first.top / BUSINESS_PAGE.height) * pageH;
    el.scrollTo({ top: Math.max(0, top - el.clientHeight / 4), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new section (or page), not every re-render
  }, [first?.section, first?.page, first?.top, width]);

  const srcs = pages?.src.split('\n') ?? [];
  const k = width / BUSINESS_PAGE.width;
  const PAD = 4;
  return (
    <>
      <div
        ref={scroller}
        className="h-[75vh] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-200/60 p-0 lg:h-[calc(100vh-7rem)] dark:border-slate-800 dark:bg-slate-800/60"
      >
        {pages ? (
          srcs.map((src, i) => (
            <div key={i} className="relative bg-white shadow-sm">
              <img src={src} alt={`Page ${i + 1}`} className="block w-full" draggable={false} />
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
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Preparing the preview…</div>
        )}
      </div>
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
