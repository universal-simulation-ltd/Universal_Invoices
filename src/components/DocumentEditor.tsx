import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { saveBlob } from '@unisim/media/save';
import { computeTotals, formatMoney, type BusinessSection } from '@unisim/doc';
import { clientFromSnapshot, clientSnapshot, issuerSnapshot, pdfFileName, pdfFingerprint } from '../lib/convert';
import { renderPdf } from '../lib/pdf';
import { KIND_NAMES, type InvoiceDoc } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import { fileSize, openAttachment } from './attachments';
import DocumentJourney from './DocumentJourney';
import LinesEditor from './LinesEditor';
import PdfPreview from './PdfPreview';
import ShareLink from './ShareLink';
import SignDialog, { type Signed } from './SignDialog';
import { ExampleChip, Field, LinesInput, btnDanger, btnGhost, btnPrimary, card, confirmAction, inputCls, sectionTitle, selectBase, selectCls } from './ui';

/**
 * The form's sections, the fields each one edits, and the parts of the PDF it
 * fills in. Each section keeps its edits until its Save (James, 2026-11-03:
 * "On each section have 'save' button after an edit which then refreshes the
 * PDF as opposed to always refreshing the pdf every edit").
 */
type SectionId = 'from' | 'document' | 'client' | 'lines' | 'terms';
const FIELDS: Record<SectionId, (keyof InvoiceDoc)[]> = {
  from: ['issuer'],
  document: ['number', 'date', 'validUntil', 'dueDate', 'subject'],
  client: ['clientId', 'client'],
  lines: ['lines', 'discount'],
  terms: ['paymentTerms', 'notes', 'taxMode', 'currency', 'taxNote', 'language', 'numberStyle', 'signature'],
};
const PDF_PARTS: Record<SectionId, BusinessSection[]> = {
  from: ['issuer'],
  document: ['document'],
  client: ['client'],
  lines: ['lines', 'totals'],
  terms: ['notes', 'terms', 'signature'],
};
const SECTIONS = Object.keys(FIELDS) as SectionId[];

/** `doc` with `section`'s fields taken from `from`. Keys set to undefined are kept, so clearing a date saves. */
function withFields(doc: InvoiceDoc, from: InvoiceDoc, sections: Iterable<SectionId>): InvoiceDoc {
  const out = { ...doc } as Record<string, unknown>;
  for (const s of sections) for (const k of FIELDS[s]) out[k] = from[k];
  return out as unknown as InvoiceDoc;
}

// Which sections are folded away: a per-viewer convenience, so localStorage.
const COLLAPSED = 'universal-invoices:collapsed-sections';
function readCollapsed(): Set<SectionId> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(COLLAPSED) ?? '[]');
    return new Set(Array.isArray(v) ? (v.filter((x) => SECTIONS.includes(x)) as SectionId[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * One document: the form on the left, the real PDF on the right. Full width
 * on purpose — the editor is the app, and a narrow card in the middle of a
 * wide screen (Universal Exports' editor, backlogged 2026-10-29) wastes the
 * room the preview needs.
 */
export default function DocumentEditor({ doc }: { doc: InvoiceDoc }) {
  const { companies, clients, products, folders, updateDocument, deleteMany, open, saveClient } = useAppStore();
  const company = companies.find((c) => c.id === doc.companyId);
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');

  // The working copy, and the sections with edits not saved yet.
  const [draft, setDraft] = useState(doc);
  const [dirty, setDirty] = useState<Set<SectionId>>(new Set());
  // The document changed underneath (a journey mark, another device): take
  // it, keeping what is being edited.
  useEffect(() => {
    setDraft((d) => withFields(doc, d, dirty));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on the saved document only
  }, [doc]);
  const edit = (section: SectionId, patch: Partial<InvoiceDoc>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty((s) => new Set(s).add(section));
  };
  const save = (sections: Iterable<SectionId>) => {
    const list = [...sections];
    if (!list.length) return doc;
    const next = withFields(doc, draft, list);
    updateDocument(next);
    setDirty((s) => new Set([...s].filter((x) => !list.includes(x))));
    return next;
  };
  const cancel = (section: SectionId) => {
    setDraft((d) => withFields(d, doc, [section]));
    setDirty((s) => new Set([...s].filter((x) => x !== section)));
  };

  // Leaving the document saves what is open — nothing typed is lost. Not a
  // deleted one: saving it would bring it back.
  const latest = useRef({ draft, dirty, doc });
  latest.current = { draft, dirty, doc };
  useEffect(
    () => () => {
      const { draft: d, dirty: ds, doc: saved } = latest.current;
      if (ds.size && useAppStore.getState().documents.some((x) => x.id === saved.id)) {
        useAppStore.getState().updateDocument(withFields(saved, d, ds));
      }
    },
    [],
  );
  useEffect(() => {
    if (!dirty.size) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty.size]);

  // Cmd/Ctrl+S saves every section.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save(dirty);
    }
  };

  // The section being worked in — hovered, else the one with the cursor — is
  // marked on the preview.
  const [hovered, setHovered] = useState<SectionId | null>(null);
  const [focused, setFocused] = useState<SectionId | null>(null);
  const pointed = hovered ?? focused;

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = useCallback((id: SectionId) => {
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLLAPSED, JSON.stringify([...next]));
      } catch {
        /* folded for this visit only */
      }
      return next;
    });
  }, []);

  // The signed copy (SignDialog), while it is still of this document.
  const signedCurrent = !!doc.signed && doc.signed.fingerprint === pdfFingerprint(doc);
  const signedBlob = useMemo(() => {
    if (!doc.signed) return undefined;
    const { dataUrl, type } = doc.signed.file;
    const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  }, [doc.signed]);
  const [signing, setSigning] = useState<Blob | null>(null);
  const onSigned = useCallback(
    async ({ name, bytes, verifyUrl }: Signed) => {
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const dataUrl = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(blob);
      });
      const latestDoc = useAppStore.getState().documents.find((x) => x.id === doc.id) ?? doc;
      updateDocument({
        ...latestDoc,
        signed: { file: { name, type: 'application/pdf', size: blob.size, dataUrl }, fingerprint: pdfFingerprint(latestDoc), at: Date.now(), ...(verifyUrl ? { verifyUrl } : {}) },
      });
      setSigning(null);
      useAppStore.setState({ notice: `Signed — the preview, Download and Share now use the signed copy.` });
    },
    [doc, updateDocument],
  );

  // Saving the PDF also offers its link (ShareLink): private until shared.
  // Unsaved edits are saved first — the download is what the form says —
  // and a current signed copy is what downloads.
  const [shareSignal, setShareSignal] = useState(0);
  const download = async () => {
    const saved = save(dirty);
    if (signedCurrent && signedBlob && !dirty.size) await saveBlob(signedBlob, doc.signed!.file.name);
    else await saveBlob(renderPdf(saved).blob, pdfFileName(saved));
    setShareSignal((n) => n + 1);
  };

  const d = draft;
  const dated = d.kind === 'invoice' ? 'dueDate' : d.kind === 'delivery-note' ? null : 'validUntil';
  const expired = dated === 'validUntil' && !!d.validUntil && d.validUntil <= d.date;
  const section = (id: SectionId) => ({
    id,
    dirty: dirty.has(id),
    collapsed: collapsed.has(id),
    onToggle: () => toggle(id),
    onSave: () => save([id]),
    onCancel: () => cancel(id),
    onPoint: (on: boolean) => setHovered(on ? id : null),
    onFocusIn: (on: boolean) => setFocused((f) => (on ? id : f === id ? null : f)),
  });

  return (
    <div className="space-y-4" onKeyDown={onKeyDown}>
      {/* The action bar. */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnGhost} onClick={() => open(null)}>
          ← All documents
        </button>
        <div className="mr-auto min-w-0 px-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">
            {KIND_NAMES[doc.kind]}
            {doc.example && <ExampleChip />}
          </div>
          <div className="truncate font-semibold text-slate-900 dark:text-slate-100">{doc.number}</div>
        </div>
        <button
          type="button"
          className={btnDanger}
          onClick={() => {
            const warn = doc.kind === 'invoice'
              ? `Delete invoice ${doc.number}? This cannot be undone — and if it was sent, invoice numbers are expected to run without gaps.`
              : `Delete ${KIND_NAMES[doc.kind].toLowerCase()} ${doc.number}? This cannot be undone.`;
            if (confirmAction(warn)) void deleteMany('documents', [doc.id]);
          }}
        >
          Delete
        </button>
        <button
          type="button"
          className={btnGhost}
          onClick={() => {
            const saved = save(dirty);
            setSigning(renderPdf(saved).blob);
          }}
        >
          Sign
        </button>
        <ShareLink doc={doc} openSignal={shareSignal} pdf={signedCurrent ? signedBlob : undefined} />
        <button type="button" className={btnPrimary} onClick={() => void download()}>
          Download PDF
        </button>
      </div>

      {signing && <SignDialog doc={doc} pdf={signing} onSigned={(x) => void onSigned(x)} onClose={() => setSigning(null)} />}

      {doc.signed && (
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-4 py-3 text-sm ${
            signedCurrent
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-amber-300 bg-amber-50 text-slate-800 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-slate-200'
          }`}
        >
          <span className="min-w-0 flex-1">
            {signedCurrent
              ? `Signed ${new Date(doc.signed.at).toLocaleString()} — the preview, Download and Share use the signed copy.`
              : `Signed ${new Date(doc.signed.at).toLocaleString()}, but the document has changed since: the signature is on the earlier version. Download and Share use the new, unsigned one.`}
          </span>
          <button type="button" className="font-medium underline" onClick={() => openAttachment(doc.signed!.file)}>
            Open the signed copy ({fileSize(doc.signed.file.size)})
          </button>
          {doc.signed.verifyUrl && (
            <a className="font-medium underline" href={doc.signed.verifyUrl} target="_blank" rel="noreferrer">
              Certificate
            </a>
          )}
          {!signedCurrent && (
            <button type="button" className="font-medium underline" onClick={() => setSigning(renderPdf(save(dirty)).blob)}>
              Sign again
            </button>
          )}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => {
              if (!confirmAction('Remove the signed copy? The document stays as it is.')) return;
              const next = { ...doc };
              delete next.signed;
              updateDocument(next);
            }}
          >
            Remove
          </button>
        </div>
      )}

      {doc.imported && <ImportedCheck doc={doc} onChecked={() => updateDocument({ ...doc, imported: { ...doc.imported!, checked: true } })} />}

      <DocumentJourney doc={doc} />

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
          {/* From, first (James, 2026-10-30): who the document is from decides
              everything under it. Not a choice here (2026-10-31): a document
              comes from the active company, picked in Your companies. */}
          <Section
            {...section('from')}
            title="From"
            summary={d.issuer.name || 'No company'}
            actions={
              company && (
                <button
                  type="button"
                  className={btnGhost}
                  title="This document keeps the company details it was made with. Take the current ones instead."
                  onClick={() => edit('from', { issuer: issuerSnapshot(company) })}
                >
                  Use current company details
                </button>
              )
            }
          >
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{d.issuer.name || 'No company'}</p>
            {d.issuer.address.length > 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{d.issuer.address.filter(Boolean).join(', ')}</p>}
          </Section>

          <Section {...section('document')} title="Document" summary={[d.number, d.subject].filter(Boolean).join(' · ')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Number">
                <input className={inputCls} value={d.number} onChange={(e) => edit('document', { number: e.target.value })} />
              </Field>
              <Field label="Date">
                <input type="date" className={inputCls} value={d.date} onChange={(e) => edit('document', { date: e.target.value })} />
              </Field>
              {dated && (
                <Field label={dated === 'dueDate' ? 'Due date' : 'Valid until'}>
                  <input
                    type="date"
                    className={`${inputCls} ${expired ? 'ring-2 ring-amber-400' : ''}`}
                    value={d[dated] ?? ''}
                    aria-invalid={expired || undefined}
                    onChange={(e) => edit('document', { [dated]: e.target.value || undefined })}
                  />
                  {/* James, 2026-11-03: "warn if validity … is the date of the document or earlier". */}
                  {expired && (
                    <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-400">
                      {d.validUntil === d.date ? 'This is the document’s own date' : 'This is before the document’s date'} — the offer would have expired as it is sent.
                    </span>
                  )}
                </Field>
              )}
              <Field label="Subject" className={dated ? '' : 'sm:col-span-2'}>
                <input className={inputCls} value={d.subject} placeholder="Quote for…" onChange={(e) => edit('document', { subject: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section
            {...section('client')}
            title="Client"
            summary={d.client.name || 'No client yet'}
            actions={
              <>
                {clients.length > 0 && (
                  <select
                    className={selectBase}
                    value={d.clientId ?? ''}
                    aria-label="Choose a client"
                    onChange={(e) => {
                      const c = clients.find((x) => x.id === e.target.value);
                      if (c) edit('client', { clientId: c.id, client: clientSnapshot(c) });
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
                {!d.clientId && d.client.name.trim() && (
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => {
                      const client = clientFromSnapshot(d.client);
                      void saveClient(client);
                      edit('client', { clientId: client.id });
                    }}
                  >
                    Save to clients
                  </button>
                )}
              </>
            }
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field label="Name">
                <input className={inputCls} value={d.client.name} onChange={(e) => edit('client', { client: { ...d.client, name: e.target.value } })} />
              </Field>
              <Field label="Client no.">
                <input className={inputCls} value={d.client.reference} onChange={(e) => edit('client', { client: { ...d.client, reference: e.target.value } })} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <LinesInput rows={3} value={d.client.address} onChange={(address) => edit('client', { client: { ...d.client, address } })} />
              </Field>
            </div>
            {/* Printed "Attn: name, role" and the email under the address. */}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {(['name', 'role', 'email'] as const).map((k) => (
                <Field key={k} label={k === 'name' ? 'Contact name' : k === 'role' ? 'Role' : 'Email'}>
                  <input
                    className={inputCls}
                    type={k === 'email' ? 'email' : 'text'}
                    value={d.client.contact?.[k] ?? ''}
                    onChange={(e) => {
                      const contact = { name: '', role: '', email: '', ...d.client.contact, [k]: e.target.value };
                      const client: InvoiceDoc['client'] = { ...d.client, contact };
                      if (!contact.name && !contact.role && !contact.email) delete client.contact;
                      edit('client', { client });
                    }}
                  />
                </Field>
              ))}
            </div>
          </Section>

          <Section
            {...section('lines')}
            title="Lines"
            summary={`${d.lines.length} line${d.lines.length === 1 ? '' : 's'}${d.kind === 'delivery-note' ? '' : ` · ${formatMoney(computeTotals(d).gross, d.currency, d.numberStyle, true)}`}`}
          >
            <LinesEditor
              doc={d}
              products={products}
              folders={folders}
              defaultTaxRate={company?.defaults.taxRate ?? 20}
              onChange={(lines) => edit('lines', { lines })}
              onDiscount={(discount) => edit('lines', { discount })}
            />
          </Section>

          <Section {...section('terms')} title="Terms and notes" summary={d.paymentTerms || d.notes.split('\n')[0]}>
            <div className="grid gap-3 sm:grid-cols-2">
              {d.kind !== 'delivery-note' && (
                <Field label="Payment terms" className="sm:col-span-2">
                  <input className={inputCls} value={d.paymentTerms} onChange={(e) => edit('terms', { paymentTerms: e.target.value })} />
                </Field>
              )}
              <Field label="Notes" className="sm:col-span-2">
                <textarea className={`${inputCls} resize-y`} rows={3} value={d.notes} onChange={(e) => edit('terms', { notes: e.target.value })} />
              </Field>
              {d.kind !== 'delivery-note' && (
                <>
                  <Field label="Tax">
                    <select className={selectCls} value={d.taxMode} onChange={(e) => edit('terms', { taxMode: e.target.value as InvoiceDoc['taxMode'] })}>
                      <option value="export-exempt">No VAT — export</option>
                      <option value="reverse-charge">No VAT — reverse charge</option>
                      <option value="standard">VAT on each line</option>
                    </select>
                  </Field>
                  <Field label="Currency">
                    <select className={selectCls} value={d.currency} onChange={(e) => edit('terms', { currency: e.target.value as InvoiceDoc['currency'] })}>
                      <option value="EUR">Euro (€)</option>
                      <option value="GBP">Pound sterling (£)</option>
                      <option value="USD">US dollar ($)</option>
                    </select>
                  </Field>
                  {d.taxMode !== 'standard' && (
                    <Field label="Exemption wording" className="sm:col-span-2" hint="Printed under the totals.">
                      <input className={inputCls} value={d.taxNote} onChange={(e) => edit('terms', { taxNote: e.target.value })} />
                    </Field>
                  )}
                </>
              )}
              <Field label="Document language">
                <select className={selectCls} value={d.language} onChange={(e) => edit('terms', { language: e.target.value as InvoiceDoc['language'] })}>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </Field>
              <Field label="Numbers look like">
                <select className={selectCls} value={d.numberStyle} onChange={(e) => edit('terms', { numberStyle: e.target.value as InvoiceDoc['numberStyle'] })}>
                  <option value="fr">163 000,00 €</option>
                  <option value="en">€163,000.00</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2 dark:text-slate-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-orange-600"
                  checked={d.signature ?? (d.kind === 'quote' || d.kind === 'estimate' || d.kind === 'delivery-note')}
                  onChange={(e) => edit('terms', { signature: e.target.checked })}
                />
                Leave space for a signature
              </label>
            </div>
          </Section>
        </div>

        <div className={`${pane === 'preview' ? '' : 'hidden lg:block'}`}>
          <div className="lg:sticky lg:top-4">
            <PdfPreview doc={doc} highlight={pointed ? PDF_PARTS[pointed] : null} file={signedCurrent ? signedBlob : undefined} />
            {dirty.size > 0 && (
              <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                Unsaved changes are not in the preview yet — Save the section (or press {navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl'}+S).
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A form section: a header that folds it away (with a one-line summary while
 * folded), its own Save and Cancel once something in it has changed, and the
 * hover / focus that marks its part of the preview.
 */
function Section({
  title,
  summary,
  actions,
  children,
  dirty,
  collapsed,
  onToggle,
  onSave,
  onCancel,
  onPoint,
  onFocusIn,
}: {
  id: SectionId;
  title: string;
  summary: string;
  actions?: ReactNode;
  children: ReactNode;
  dirty: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onSave: () => void;
  onCancel: () => void;
  onPoint: (on: boolean) => void;
  onFocusIn: (on: boolean) => void;
}) {
  const body = useId();
  return (
    <section
      className={`${card} transition-shadow ${dirty ? 'ring-2 ring-amber-300 dark:ring-amber-800' : ''}`}
      onMouseEnter={() => onPoint(true)}
      onMouseLeave={() => onPoint(false)}
      onFocus={() => onFocusIn(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onFocusIn(false);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-expanded={!collapsed} aria-controls={body} onClick={onToggle} className="-ml-1 mr-auto flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={`shrink-0 text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}>
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 className={sectionTitle}>{title}</h2>
          {collapsed && summary && <span className="truncate text-sm text-slate-500 dark:text-slate-400">{summary}</span>}
        </button>
        {!collapsed && actions}
        {dirty && (
          <>
            <button type="button" className={`${btnGhost} py-1.5`} onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className={`${btnPrimary} py-1.5`} onClick={onSave}>
              Save
            </button>
          </>
        )}
      </div>
      <div id={body} hidden={collapsed} className="mt-3">
        {children}
      </div>
    </section>
  );
}

/**
 * An imported document, until you say its amounts match the PDF (James,
 * 2026-11-03: "need to be able to generate another document from it, so
 * user will need to verify amount etc"): the PDF's own total beside what
 * the lines read add up to, and the PDF itself one tap away.
 */
function ImportedCheck({ doc, onChecked }: { doc: InvoiceDoc; onChecked: () => void }) {
  const { file, statedTotal, checked } = doc.imported!;
  const bare = doc.lines.filter((l) => !l.image).length;
  const priced = doc.kind !== 'delivery-note';
  const gross = priced ? computeTotals(doc).gross : undefined;
  const money = (minor: number) => formatMoney(minor, doc.currency, doc.numberStyle, true);
  // A cent either way is rounding in the PDF's own sums.
  const matches = statedTotal === undefined || gross === undefined ? undefined : Math.abs(statedTotal - gross) <= 1;
  const original = (
    <button type="button" className="font-medium text-orange-700 underline dark:text-orange-400" onClick={() => openAttachment(file)}>
      {file.name}
    </button>
  );
  if (checked) {
    return <p className="text-sm text-slate-600 dark:text-slate-400">Imported from {original}.</p>;
  }
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center text-sm text-slate-800 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-slate-200">
      <div className="min-w-0 flex-1 space-y-1">
        <p>
          Read from {original}. Check the lines, prices and dates against it before making anything from this {KIND_NAMES[doc.kind].toLowerCase()}.
        </p>
        {bare > 0 && (
          <p className="text-slate-600 dark:text-slate-400">
            {bare === doc.lines.length ? 'The lines have' : `${bare} line${bare === 1 ? ' has' : 's have'}`} no picture — a PDF’s pictures are not read. Tap the box beside a line to pick one from your catalogue or upload one.
          </p>
        )}
        {gross !== undefined && (
          <p className={matches === false ? 'font-semibold text-red-700 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}>
            {statedTotal !== undefined ? `The PDF’s total: ${money(statedTotal)} · ` : 'No total found in the PDF · '}
            these lines come to {money(gross)}
            {matches === true && ' — they match'}
            {matches === false && ' — they do not match'}.
          </p>
        )}
      </div>
      <button type="button" className={btnPrimary} onClick={onChecked}>
        Checked — it matches
      </button>
    </div>
  );
}
