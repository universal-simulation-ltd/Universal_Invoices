import { useRef, useState } from 'react';
import type { BusinessDocKind } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import { readAttachment } from './attachments';
import { btnGhost } from './ui';

/**
 * "Import PDF" (James, 2026-11-03): a quote, estimate or invoice made
 * somewhere else, read into a document here (lib/readPdf.ts) with the PDF
 * kept beside it to check against. Read in this browser — nothing uploaded.
 */
export default function ImportPdfButton({ kind, companyId }: { kind: BusinessDocKind | 'all'; companyId?: string }) {
  const importRead = useAppStore((s) => s.importRead);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const read = async (files: File[]) => {
    setBusy(true);
    try {
      // pdf.js (1 MB) arrives with the first import, not with the app.
      const [{ readPdfText }, { readBusinessPdf }] = await Promise.all([import('../lib/pdfText'), import('../lib/readPdf')]);
      for (const f of files) {
        try {
          const found = readBusinessPdf(await readPdfText(await f.arrayBuffer()));
          if (!found.lines.length && !found.number) {
            useAppStore.setState({ notice: `${f.name} has no text to read — a scan or a photo. Make the document with New document instead.` });
            continue;
          }
          // Too big to keep is still worth reading.
          const file = await readAttachment(f).catch(() => undefined);
          await importRead(found, file, kind === 'all' ? 'quote' : kind, companyId);
        } catch {
          useAppStore.setState({ notice: `${f.name} could not be read as a PDF.` });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={btnGhost} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Reading…' : 'Import PDF'}
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) void read(files);
        }}
      />
    </>
  );
}
