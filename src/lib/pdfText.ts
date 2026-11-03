// pdf.js, loaded the first time it is needed — 1 MB of script the rest of the
// app does without: "Import PDF" reads a PDF's positioned text (readPdf.ts),
// and the preview draws the pages (PdfPreview.tsx).

import type { PdfTextPage } from './readPdf';

type PdfJs = typeof import('pdfjs-dist');
type PdfDocument = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;

// ⚠️ ONE worker for the life of the app, handed to every document explicitly
// (`worker:` below), as Universal PDF does (its src/lib/pdfjs.ts has the
// story): a document that pdf.js built its own worker for destroys that worker
// when it is destroyed, and pdf.js caches the worker per port — so destroying
// the preview's last document would fail the next one mid-load.
let loaded: Promise<{ lib: PdfJs; worker: InstanceType<PdfJs['PDFWorker']> }> | null = null;
function pdfjs() {
  loaded ??= (async () => {
    const lib = await import('pdfjs-dist');
    // ?worker (IIFE, see vite.config.ts) so iOS Safari gets a classic worker.
    const { default: PdfjsWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker');
    const port = new PdfjsWorker();
    lib.GlobalWorkerOptions.workerPort = port;
    return { lib, worker: lib.PDFWorker.fromPort({ port }) };
  })();
  return loaded;
}

/** Open a PDF. The file is untrusted: no compiled font programs, nothing fetched on its behalf. Destroy it when done. */
export async function openPdf(bytes: ArrayBuffer | Uint8Array): Promise<PdfDocument> {
  const { lib, worker } = await pdfjs();
  const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
  return lib.getDocument({ data, worker, isEvalSupported: false, disableAutoFetch: true, disableStream: true }).promise;
}

/** The pages of an open pdf.js document as readPdf's text. Shared with the tests, which open it with the Node build. */
export async function textPages(pdf: {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { width: number; height: number };
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
}): Promise<PdfTextPage[]> {
  const pages: PdfTextPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = (content.items as { str?: string; transform?: number[]; width?: number; height?: number }[])
      .filter((i) => typeof i.str === 'string' && i.transform)
      .map((i) => ({ str: i.str!, x: i.transform![4], y: height - i.transform![5], width: i.width ?? 0, height: i.height || Math.abs(i.transform![3]) }));
    pages.push({ width, height, items });
  }
  return pages;
}

export async function readPdfText(bytes: ArrayBuffer): Promise<PdfTextPage[]> {
  const doc = await openPdf(bytes);
  try {
    return await textPages(doc);
  } finally {
    await doc.destroy();
  }
}
