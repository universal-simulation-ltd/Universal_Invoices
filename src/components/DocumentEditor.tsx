import { useEffect, useMemo, useRef, useState } from 'react';
import { saveBlob } from '@unisim/media/save';
import { clientSnapshot, issuerSnapshot, pdfFileName, uid } from '../lib/convert';
import { renderPdf } from '../lib/pdf';
import { KIND_NAMES, KIND_ORDER, STATUS_NAMES, type DocStatus, type InvoiceDoc } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import LinesEditor from './LinesEditor';
import { Field, LinesInput, btnDanger, btnGhost, btnPrimary, card, confirmAction, inputCls, sectionTitle, selectBase, selectCls } from './ui';

const STATUSES: DocStatus[] = ['draft', 'sent', 'accepted', 'declined', 'paid', 'cancelled'];

/**
 * One document: the form on the left, the real PDF on the right. Full width
 * on purpose — the editor is the app, and a narrow card in the middle of a
 * wide screen (Universal Exports' editor, backlogged 2026-10-29) wastes the
 * room the preview needs.
 */
export default function DocumentEditor({ doc }: { doc: InvoiceDoc }) {
  const { companies, clients, products, documents, updateDocument, deleteDocument, convert, duplicate, open, saveClient } = useAppStore();
  const company = companies.find((c) => c.id === doc.companyId);
  const source = doc.sourceId ? documents.find((d) => d.id === doc.sourceId) : undefined;
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');
  const set = (patch: Partial<InvoiceDoc>) => updateDocument({ ...doc, ...patch });

  // The preview re-renders a beat after typing stops: layout is fast, but a
  // new blob URL per keystroke makes the browser's PDF viewer flicker.
  const [preview, setPreview] = useState<{ url: string; pages: number; dropped: string[] } | null>(null);
  const shownUrl = useRef<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const r = renderPdf(doc);
      const url = URL.createObjectURL(r.blob);
      if (shownUrl.current) URL.revokeObjectURL(shownUrl.current);
      shownUrl.current = url;
      setPreview({ url, pages: r.pages, dropped: r.dropped });
    }, 350);
    return () => clearTimeout(t);
  }, [doc]);
  useEffect(
    () => () => {
      if (shownUrl.current) URL.revokeObjectURL(shownUrl.current);
    },
    [],
  );

  const download = async () => {
    await saveBlob(renderPdf(doc).blob, pdfFileName(doc));
    if (doc.status === 'draft') set({ status: 'sent' });
  };

  const convertTargets = useMemo(() => KIND_ORDER.filter((k) => k !== doc.kind), [doc.kind]);
  const dated = doc.kind === 'invoice' ? 'dueDate' : doc.kind === 'delivery-note' ? null : 'validUntil';

  return (
    <div className="space-y-4">
      {/* The action bar. */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnGhost} onClick={() => open(null)}>
          ← All documents
        </button>
        <div className="mr-auto min-w-0 px-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">{KIND_NAMES[doc.kind]}</div>
          <div className="truncate font-semibold text-slate-900 dark:text-slate-100">{doc.number}</div>
        </div>
        <select className={selectBase} value={doc.status} onChange={(e) => set({ status: e.target.value as DocStatus })} aria-label="Status">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_NAMES[s]}
            </option>
          ))}
        </select>
        <select
          className={selectBase}
          value=""
          aria-label="Make another document from this one"
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'duplicate') void duplicate(doc.id);
            else if (v) void convert(doc.id, v as InvoiceDoc['kind']);
          }}
        >
          <option value="">Make…</option>
          <option value="duplicate">A copy of this {KIND_NAMES[doc.kind].toLowerCase()}</option>
          {convertTargets.map((k) => (
            <option key={k} value={k}>
              {KIND_NAMES[k]} from this
            </option>
          ))}
        </select>
        <button
          type="button"
          className={btnDanger}
          onClick={() => {
            const warn = doc.kind === 'invoice' && doc.status !== 'draft'
              ? `Delete invoice ${doc.number}? It has been issued — Invoice numbers are expected to run without gaps — consider marking it Cancelled instead.`
              : `Delete ${KIND_NAMES[doc.kind].toLowerCase()} ${doc.number}? This cannot be undone.`;
            if (confirmAction(warn)) void deleteDocument(doc.id);
          }}
        >
          Delete
        </button>
        <button type="button" className={btnPrimary} onClick={() => void download()}>
          Download PDF
        </button>
      </div>

      {source && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Made from {KIND_NAMES[source.kind].toLowerCase()}{' '}
          <button type="button" className="font-medium text-orange-700 underline dark:text-orange-400" onClick={() => open(source.id)}>
            {source.number}
          </button>
          .
        </p>
      )}

      {/* Phone: one pane at a time. */}
      <div className="flex gap-1 rounded-lg bg-slate-200 p-1 lg:hidden dark:bg-slate-800" role="tablist">
        {(['edit', 'preview'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pane === p}
            onClick={() => setPane(p)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${pane === p ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}
          >
            {p === 'edit' ? 'Edit' : 'Preview'}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={`space-y-4 ${pane === 'edit' ? '' : 'hidden lg:block'}`}>
          <section className={card}>
            <h2 className={sectionTitle}>Document</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Number">
                <input className={inputCls} value={doc.number} onChange={(e) => set({ number: e.target.value })} />
              </Field>
              <Field label="Date">
                <input type="date" className={inputCls} value={doc.date} onChange={(e) => set({ date: e.target.value })} />
              </Field>
              {dated && (
                <Field label={dated === 'dueDate' ? 'Due date' : 'Valid until'}>
                  <input type="date" className={inputCls} value={doc[dated] ?? ''} onChange={(e) => set({ [dated]: e.target.value || undefined })} />
                </Field>
              )}
              <Field label="Subject" className={dated ? '' : 'sm:col-span-2'}>
                <input className={inputCls} value={doc.subject} placeholder="Quote for…" onChange={(e) => set({ subject: e.target.value })} />
              </Field>
            </div>
          </section>

          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={sectionTitle}>Client</h2>
              <div className="flex flex-wrap gap-2">
                {clients.length > 0 && (
                  <select
                    className={selectBase}
                    value={doc.clientId ?? ''}
                    aria-label="Choose a client"
                    onChange={(e) => {
                      const c = clients.find((x) => x.id === e.target.value);
                      if (c) set({ clientId: c.id, client: clientSnapshot(c) });
                    }}
                  >
                    <option value="">Choose a saved client…</option>
                    {[...clients]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                )}
                {!doc.clientId && doc.client.name.trim() && (
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => {
                      const id = uid();
                      void saveClient({ id, ...doc.client, email: '', updatedAt: Date.now() });
                      set({ clientId: id });
                    }}
                  >
                    Save to clients
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field label="Name">
                <input className={inputCls} value={doc.client.name} onChange={(e) => set({ client: { ...doc.client, name: e.target.value } })} />
              </Field>
              <Field label="Client no.">
                <input className={inputCls} value={doc.client.reference} onChange={(e) => set({ client: { ...doc.client, reference: e.target.value } })} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <LinesInput rows={3} value={doc.client.address} onChange={(address) => set({ client: { ...doc.client, address } })} />
              </Field>
            </div>
          </section>

          <section className={card}>
            <h2 className={sectionTitle}>Lines</h2>
            <div className="mt-3">
              <LinesEditor doc={doc} products={products} defaultTaxRate={company?.defaults.taxRate ?? 20} onChange={(lines) => set({ lines })} />
            </div>
          </section>

          <section className={card}>
            <h2 className={sectionTitle}>Terms and notes</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {doc.kind !== 'delivery-note' && (
                <Field label="Payment terms" className="sm:col-span-2">
                  <input className={inputCls} value={doc.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} />
                </Field>
              )}
              <Field label="Notes" className="sm:col-span-2">
                <textarea className={`${inputCls} resize-y`} rows={3} value={doc.notes} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
              {doc.kind !== 'delivery-note' && (
                <>
                  <Field label="Tax">
                    <select className={selectCls} value={doc.taxMode} onChange={(e) => set({ taxMode: e.target.value as InvoiceDoc['taxMode'] })}>
                      <option value="export-exempt">No VAT — export</option>
                      <option value="reverse-charge">No VAT — reverse charge</option>
                      <option value="standard">VAT on each line</option>
                    </select>
                  </Field>
                  <Field label="Currency">
                    <select className={selectCls} value={doc.currency} onChange={(e) => set({ currency: e.target.value as InvoiceDoc['currency'] })}>
                      <option value="EUR">Euro (€)</option>
                      <option value="GBP">Pound sterling (£)</option>
                      <option value="USD">US dollar ($)</option>
                    </select>
                  </Field>
                  {doc.taxMode !== 'standard' && (
                    <Field label="Exemption wording" className="sm:col-span-2" hint="Printed under the totals.">
                      <input className={inputCls} value={doc.taxNote} onChange={(e) => set({ taxNote: e.target.value })} />
                    </Field>
                  )}
                </>
              )}
              <Field label="Document language">
                <select className={selectCls} value={doc.language} onChange={(e) => set({ language: e.target.value as InvoiceDoc['language'] })}>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </Field>
              <Field label="Numbers look like">
                <select className={selectCls} value={doc.numberStyle} onChange={(e) => set({ numberStyle: e.target.value as InvoiceDoc['numberStyle'] })}>
                  <option value="fr">163 000,00 €</option>
                  <option value="en">€163,000.00</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2 dark:text-slate-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-orange-600"
                  checked={doc.signature ?? (doc.kind === 'quote' || doc.kind === 'estimate' || doc.kind === 'delivery-note')}
                  onChange={(e) => set({ signature: e.target.checked })}
                />
                Leave space for a signature
              </label>
            </div>
          </section>

          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className={sectionTitle}>From</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">{doc.issuer.name || 'No company'}</p>
              </div>
              {company && (
                <button
                  type="button"
                  className={btnGhost}
                  title="This document keeps the company details it was made with. Take the current ones instead."
                  onClick={() => set({ issuer: issuerSnapshot(company) })}
                >
                  Use current company details
                </button>
              )}
            </div>
          </section>
        </div>

        <div className={`${pane === 'preview' ? '' : 'hidden lg:block'}`}>
          <div className="lg:sticky lg:top-4">
            {preview ? (
              <>
                <iframe
                  title="PDF preview"
                  // Fit the page to the pane's width; the viewers otherwise open at 100% and crop it.
                  src={`${preview.url}#view=FitH`} className="h-[75vh] w-full rounded-2xl border border-slate-200 bg-white lg:h-[calc(100vh-7rem)] dark:border-slate-800" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {preview.pages} page{preview.pages === 1 ? '' : 's'} · made in this browser, nothing uploaded
                  {preview.dropped.length > 0 && (
                    <span className="ml-2 font-medium text-red-700 dark:text-red-400">
                      These characters cannot be printed and show as “?”: {preview.dropped.join(' ')}
                    </span>
                  )}
                </p>
              </>
            ) : (
              <div className="flex h-[60vh] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                Preparing the preview…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
