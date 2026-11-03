// The positioned text of a PDF, for readPdf.ts. pdf.js is loaded the first
// time someone imports a PDF — 1 MB of script nobody else needs.

import type { PdfTextPage } from './readPdf';

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
  const pdfjs = await import('pdfjs-dist');
  // ?worker (IIFE, see vite.config.ts) so iOS Safari gets a classic worker — as Universal PDF does.
  const { default: PdfjsWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker');
  const worker = new PdfjsWorker();
  pdfjs.GlobalWorkerOptions.workerPort = worker;
  // The file is untrusted: no compiled font programs, nothing fetched on its behalf.
  const doc = await pdfjs.getDocument({ data: bytes.slice(0), isEvalSupported: false, disableAutoFetch: true, disableStream: true }).promise;
  try {
    return await textPages(doc);
  } finally {
    await doc.destroy();
    worker.terminate();
  }
}
