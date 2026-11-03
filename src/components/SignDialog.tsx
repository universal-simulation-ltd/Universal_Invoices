import { useEffect, useRef, useState } from 'react';
import { pdfFileName } from '../lib/convert';
import { KIND_NAMES, type InvoiceDoc } from '../lib/types';
import { btnGhost } from './ui';

// Beside this app on the same site in production (/invoices, /signatures,
// /pdf); separate dev servers in development.
const SIGNATURES_URL = import.meta.env.VITE_SIGNATURES_URL || `${location.origin}/signatures/`;
const PDF_URL = import.meta.env.VITE_PDF_URL || `${location.origin}/pdf/`;
const originOf = (url: string) => new URL(url, location.href).origin;

export interface Signed {
  name: string;
  bytes: ArrayBuffer;
  verifyUrl: string | null;
}

/**
 * Sign the document in Universal Signatures, framed here (James, 2026-11-03:
 * "Try Universal Signatures with a link to Open in Universal PDF also for
 * full options"). The PDF is posted in once Signatures says it is ready; the
 * signed copy comes back the same way (Universal_Signatures src/lib/embed.ts).
 * Nothing is uploaded unless you ask Signatures for a signing certificate.
 */
export default function SignDialog({ doc, pdf, onSigned, onClose }: { doc: InvoiceDoc; pdf: Blob; onSigned: (s: Signed) => void; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const name = pdfFileName(doc);

  useEffect(() => {
    const origin = originOf(SIGNATURES_URL);
    const onMessage = async (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.origin !== origin) return;
      const m = e.data as { type?: string; name?: string; bytes?: ArrayBuffer; verifyUrl?: string | null } | null;
      if (m?.type === 'unisim-sign/ready') {
        const bytes = await pdf.arrayBuffer();
        frame.current?.contentWindow?.postMessage({ type: 'unisim-sign/pdf', name, bytes }, origin, [bytes]);
        setReady(true);
      } else if (m?.type === 'unisim-sign/signed' && m.bytes instanceof ArrayBuffer) {
        onSigned({ name: m.name || name, bytes: m.bytes, verifyUrl: m.verifyUrl ?? null });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [pdf, name, onSigned]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The full editor: the same PDF opened in Universal PDF, in a new tab.
  const openInPdf = async () => {
    const tab = window.open(`${PDF_URL}?receive`, '_blank');
    if (!tab) return;
    const origin = originOf(PDF_URL);
    const bytes = await pdf.arrayBuffer();
    const onMessage = (e: MessageEvent) => {
      if (e.source !== tab || e.origin !== origin || (e.data as { type?: string })?.type !== 'unisim-open/ready') return;
      window.removeEventListener('message', onMessage);
      tab.postMessage({ type: 'unisim-open/file', name, mime: 'application/pdf', bytes }, origin, [bytes]);
    };
    window.addEventListener('message', onMessage);
    // Not ready within a minute (closed, blocked): stop listening.
    setTimeout(() => window.removeEventListener('message', onMessage), 60_000);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-slate-900/60 p-2 backdrop-blur-sm sm:p-6" role="dialog" aria-modal aria-label={`Sign ${KIND_NAMES[doc.kind].toLowerCase()} ${doc.number}`}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="mr-auto min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              Sign {KIND_NAMES[doc.kind].toLowerCase()} {doc.number}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {ready ? 'Draw or pick your signature, place it, then Sign — the signed copy comes back here.' : 'Opening Universal Signatures…'}
            </p>
          </div>
          <button type="button" className={btnGhost} onClick={() => void openInPdf()} title="Notes, highlights, forms, more signing options — in a new tab">
            Open in Universal PDF ↗
          </button>
          <button type="button" className={btnGhost} onClick={onClose}>
            Close
          </button>
        </div>
        <iframe ref={frame} title="Universal Signatures" src={`${SIGNATURES_URL}?embed`} className="min-h-0 w-full flex-1 bg-slate-100" allow="clipboard-write" />
      </div>
    </div>
  );
}
