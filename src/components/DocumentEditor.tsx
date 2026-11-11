import { soldBy } from '../lib/soldBy';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { saveBlob } from '@unisim/media/save';
import { computeTotals, formatMoney, type BusinessSection } from '@unisim/doc';
import { GrowingTextarea, useUserPrefs } from '@unisim/sdk';
import { cataloguePictures } from '../lib/arrange';
import { blankLine, clientFromSnapshot, clientSnapshot, issuerSnapshot, lineFromProduct, pdfFileName, pdfFingerprint } from '../lib/convert';
import { renderPdf } from '../lib/pdf';
import { KIND_NAMES, type DocLine, type InvoiceDoc, type VersionReason } from '../lib/types';
import { removeVersion, restoreVersion, withVersion } from '../lib/versions';
import { frenchEInvoicing } from '../lib/france';
import { FRENCH_NOTE_SEEN } from './shownKinds';
import { useAppStore } from '../stores/appStore';
import { fileSize, openAttachment } from './attachments';
import CataloguePicker from './CatalogueAdd';
import CurrencyConvert from './CurrencyConvert';
import CustomsCopy from './CustomsCopy';
import DocumentJourney from './DocumentJourney';
import DocumentVersions from './DocumentVersions';
import LineFields from './LineFields';
import LinesSummary, { TotalsFields } from './LinesSummary';
import MoreMenu, { menuItem } from './MoreMenu';
import PdfPreview from './PdfPreview';
import ShareLink from './ShareLink';
import SignDialog, { type Signed } from './SignDialog';
import { ExampleChip, Field, LinesInput, btnGhost, btnPrimary, card, checkboxCls, confirmAction, inputCls, sectionTitle, selectBase, selectCls, useMedia } from './ui';

/**
 * The form's sections, the fields each one edits, and the parts of the PDF it
 * fills in. Each section keeps its edits until its Save (James, 2026-11-03:
 * "On each section have 'save' button after an edit which then refreshes the
 * PDF as opposed to always refreshing the pdf every edit") — or until you
 * leave the box you are typing in (later the same day: "auto update pdf edit
 * when clicking out of box"), when it saves itself and the preview flashes
 * what changed.
 */
type SectionId = 'from' | 'document' | 'client' | 'lines' | 'payment' | 'terms';
const FIELDS: Record<SectionId, (keyof InvoiceDoc)[]> = {
  from: ['issuer'],
  document: ['number', 'date', 'validUntil', 'dueDate', 'subject'],
  client: ['clientId', 'client'],
  lines: ['lines', 'discount', 'showUnits', 'showOrigin'],
  // Payment details and Notes and more were one section, "Terms and notes",
  // until 2026-11-10 (James: "split terms and notes into two separate
  // sections", and "use 'Notes and more' instead as payment terms will go in
  // new payment section"). The id stays `terms` so folded state carries over.
  payment: ['paymentTerms'],
  terms: ['notes', 'taxMode', 'currency', 'taxNote', 'language', 'numberStyle', 'signature'],
};
const PDF_PARTS: Record<SectionId, BusinessSection[]> = {
  from: ['issuer'],
  document: ['document'],
  client: ['client'],
  lines: ['lines', 'totals'],
  // `payment` is the payment terms and bank rows (@unisim/doc 0.19.0); `terms`
  // is what older renderers tagged the payment terms with.
  payment: ['payment', 'terms'],
  terms: ['notes', 'signature'],
};
const SECTIONS = Object.keys(FIELDS) as SectionId[];
const SECTION_TITLES: Record<SectionId, string> = { from: 'From', document: 'Document', client: 'Client', lines: 'Lines', payment: 'Payment details', terms: 'Notes and more' };

/** `doc` with `section`'s fields taken from `from`. Keys set to undefined are kept, so clearing a date saves. */
function withFields(doc: InvoiceDoc, from: InvoiceDoc, sections: Iterable<SectionId>): InvoiceDoc {
  const out = { ...doc } as Record<string, unknown>;
  for (const s of sections) {
    for (const k of FIELDS[s]) out[k] = from[k];
    // The bank lines print with the payment terms, so they are edited — and
    // saved — in Payment details; the rest of `issuer` is From's (James, 2026-11-03).
    const issuer = out.issuer as InvoiceDoc['issuer'];
    if (s === 'from') out.issuer = { ...from.issuer, bank: issuer.bank };
    if (s === 'payment') out.issuer = { ...issuer, bank: from.issuer.bank };
  }
  return out as unknown as InvoiceDoc;
}

/** The form section that fills in a part of the PDF. */
const SECTION_OF = Object.fromEntries(SECTIONS.flatMap((id) => PDF_PARTS[id].map((part) => [part, id]))) as Record<BusinessSection, SectionId>;

/** The parts of the PDF a click edits on the page itself, and the section whose fields open there (lines have their own editor). */
// The totals open the document-wide discount (2026-11-10), which is the Lines section's.
const ON_PAGE: Partial<Record<BusinessSection, SectionId>> = { totals: 'lines', issuer: 'from', document: 'document', client: 'client', payment: 'payment', terms: 'payment', notes: 'terms', signature: 'terms' };
const ON_PAGE_PARTS = Object.keys(ON_PAGE) as BusinessSection[];

/**
 * One document: the form on the left, the real PDF on the right. Full width
 * on purpose — the editor is the app, and a narrow card in the middle of a
 * wide screen (Universal Exports' editor, backlogged 2026-10-29) wastes the
 * room the preview needs.
 */
export default function DocumentEditor({ doc }: { doc: InvoiceDoc }) {
  const { companies, clients, products, folders, updateDocument, deleteMany, duplicate, open, saveClient } = useAppStore();
  const company = companies.find((c) => c.id === doc.companyId);
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');
  const [customs, setCustoms] = useState(false);

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
    // The text box this edit was typed in, if it was: the section saves once you leave it.
    const el = document.activeElement;
    boxOf.current.set(section, isTextBox(el) ? el : null);
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

  // Saving as you go: a section saves once you leave the box you typed in. A
  // text box keeps its edits while the cursor is in it (so Cancel still has
  // something to undo); a list, a tick box, a picture or a line added or moved
  // saves straight away. A press on Cancel holds the save — the box it takes
  // the cursor from would otherwise save just before the Cancel lands.
  const boxOf = useRef(new Map<SectionId, Element | null>());
  const holding = useRef(false);
  const [left, setLeft] = useState(0);
  const hold = () => {
    holding.current = true;
    window.addEventListener(
      'pointerup',
      () =>
        setTimeout(() => {
          holding.current = false;
          setLeft((n) => n + 1);
        }),
      { once: true },
    );
  };
  useEffect(() => {
    if (!dirty.size) return;
    const t = setTimeout(() => {
      if (holding.current) return;
      const done = [...dirty].filter((s) => !stillIn(s, boxOf.current.get(s)));
      if (done.length) save(done);
    });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `save` reads this render's draft
  }, [dirty, draft, left]);

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

  // Every section starts folded (James, 2026-11-03: "have all collapsed and
  // on the viewer on hover highlight a section and on click open that
  // collapsible"): the PDF is the map, a click on a part of it opens its section.
  const [collapsed, setCollapsed] = useState<Set<SectionId>>(() => new Set(SECTIONS));
  const toggle = useCallback((id: SectionId) => {
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  // The section under the pointer on the preview, and the one a click on it opened (to scroll to).
  const [overPart, setOverPart] = useState<BusinessSection | null>(null);
  const overSection = overPart ? SECTION_OF[overPart] : null;
  const [reveal, setReveal] = useState<{ id: SectionId; at: number } | null>(null);
  const openFromPdf = (part: BusinessSection) => {
    const id = SECTION_OF[part];
    if (!id) return;
    setCollapsed((c) => new Set([...c].filter((x) => x !== id)));
    setPane('edit');
    setReveal({ id, at: Date.now() });
  };
  useEffect(() => {
    if (!reveal) return;
    document.querySelector(`[data-section="${reveal.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [reveal]);

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
      const latestDoc = withVersion(useAppStore.getState().documents.find((x) => x.id === doc.id) ?? doc, 'sign');
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
    updateDocument(withVersion(savedNow(), 'download'));
    if (signedCurrent && signedBlob && !dirty.size) await saveBlob(signedBlob, doc.signed!.file.name);
    else await saveBlob(renderPdf(saved).blob, pdfFileName(saved));
    setShareSignal((n) => n + 1);
  };

  // Lines edited on the preview (James, 2026-11-10: "edit directly onto the
  // PDF preview"): the row whose editor is open, and the last one removed,
  // for its Undo.
  const [lineOpen, setLineOpen] = useState<number | null>(null);
  // A line opened from the Lines section where the preview cannot take it (a
  // phone's form pane, a signed copy on show): its fields open under its row.
  const [formLine, setFormLine] = useState<number | null>(null);
  const [removed, setRemoved] = useState<{ line: DocLine; index: number; at: number } | null>(null);
  // The rest of the page, the same way (backlog, 2026-11-10: "parties, dates
  // and notes on the page"): the part whose section's fields are open on it.
  const [partOpen, setPartOpen] = useState<BusinessSection | null>(null);
  const partSection = partOpen ? ON_PAGE[partOpen] : undefined;
  useEffect(() => {
    setLineOpen(null);
    setFormLine(null);
    setPartOpen(null);
    setRemoved(null);
  }, [doc.id]);
  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), 10_000);
    return () => clearTimeout(t);
  }, [removed]);
  const catalogue = products.filter((p) => soldBy(p, doc.companyId, companies));
  const pictures = cataloguePictures(catalogue, folders);
  const onPage = useMedia('(min-width: 1024px)') && !signedCurrent;
  // The page redraws when an edit is saved: on Done, on another row, and when
  // the cursor leaves the editor — as leaving a box in the form does.
  const saveLines = () => {
    if (dirty.has('lines')) save(['lines']);
  };
  const openLine = (line: number | null) => {
    saveLines();
    if (line !== null) setPartOpen(null);
    setLineOpen(line);
  };
  const savePart = () => {
    if (partSection && dirty.has(partSection)) save([partSection]);
  };
  const openPart = (part: BusinessSection | null) => {
    savePart();
    if (part) {
      saveLines();
      setLineOpen(null);
    }
    setPartOpen(part);
  };
  // A row dragged on the preview to slot `to` (PdfPreview). The open editor,
  // if any, stays on the same line wherever it lands.
  const moveLine = (from: number, to: number) => {
    if (from >= draft.lines.length) return;
    const openId = lineOpen !== null ? draft.lines[lineOpen]?.id : undefined;
    const next = [...draft.lines];
    const [line] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, line);
    edit('lines', { lines: next });
    if (openId) setLineOpen(next.findIndex((l) => l.id === openId));
  };
  const addLine = (line: DocLine) => {
    edit('lines', { lines: [...draft.lines, line] });
    setLineOpen(draft.lines.length);
  };
  // The catalogue picker (CatalogueAdd.tsx): its tiles add lines without
  // opening them, so several go in at once; closing it saves, and the page redraws.
  const [picking, setPicking] = useState(false);

  // Versions (lib/versions.ts). What is being edited is saved first, so a
  // version is of the document as the form reads now.
  // The French e-invoicing note, until "Got it" (lib/france.ts).
  const { pref, setPref } = useUserPrefs();
  const frenchNoteSeen = pref<boolean>(FRENCH_NOTE_SEEN, false) === true;
  const savedNow = () => useAppStore.getState().documents.find((x) => x.id === doc.id) ?? doc;
  const snapshot = (reason: VersionReason, name?: string) => {
    save(dirty);
    updateDocument(withVersion(savedNow(), reason, name));
  };

  const d = draft;
  // A line's fields: in the card on the preview, or under its row in the Lines section.
  const lineEditor = (i: number | null, setOpen: (n: number | null) => void, done: () => void) =>
    i !== null && d.lines[i] && (
      <>
        <LineFields
          key={d.lines[i].id}
          doc={d}
          index={i}
          pictures={pictures}
          total={formatMoney(computeTotals(d).lines[i], d.currency, d.numberStyle, true)}
          autoFocus
          onSet={(patch) => edit('lines', { lines: d.lines.map((l, n) => (n === i ? { ...l, ...patch } : l)) })}
          onMove={(by) => {
            const next = [...d.lines];
            const [line] = next.splice(i, 1);
            next.splice(i + by, 0, line);
            edit('lines', { lines: next });
            setOpen(i + by);
          }}
          onRemove={() => {
            setRemoved({ line: d.lines[i], index: i, at: Date.now() });
            edit('lines', { lines: d.lines.filter((_, n) => n !== i) });
            setOpen(null);
          }}
        />
        <div className="mt-3 flex justify-end">
          <button type="button" className={btnPrimary} onClick={done}>
            Done
          </button>
        </div>
      </>
    );
  // A row of the Lines section: the card on the preview where it can take it,
  // else the fields under the row.
  const openFromList = (i: number) => {
    if (onPage) return openLine(i === lineOpen ? null : i);
    saveLines();
    setFormLine(i === formLine ? null : i);
  };
  const removedChip = removed && Date.now() - removed.at < 10_000 && (
    <span className="flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs text-white shadow dark:bg-slate-100 dark:text-slate-900">
      Line removed
      <button
        type="button"
        className="font-semibold underline"
        onClick={() => {
          const next = [...d.lines];
          next.splice(Math.min(removed.index, next.length), 0, removed.line);
          edit('lines', { lines: next });
          setRemoved(null);
        }}
      >
        Undo
      </button>
    </span>
  );
  const addBlank = () => {
    const line = blankLine(d.taxMode === 'standard' ? (company?.defaults.taxRate ?? 20) : undefined);
    if (onPage) return addLine(line);
    edit('lines', { lines: [...draft.lines, line] });
    setFormLine(draft.lines.length);
  };
  const dated = d.kind === 'invoice' ? 'dueDate' : d.kind === 'delivery-note' ? null : 'validUntil';
  const expired = dated === 'validUntil' && !!d.validUntil && d.validUntil <= d.date;
  // Which of the company's accounts the document's bank lines are, if any.
  const sameLines = (a: string[], b: string[]) => a.map((x) => x.trim()).filter(Boolean).join('\n') === b.map((x) => x.trim()).filter(Boolean).join('\n');
  const bankChoice = !company ? 'edited' : sameLines(d.issuer.bank, company.bank) ? 'main' : (company.moreBanks?.find((b) => sameLines(b.lines, d.issuer.bank))?.id ?? 'edited');
  const section = (id: SectionId) => ({
    id,
    dirty: dirty.has(id),
    collapsed: collapsed.has(id),
    marked: overSection === id,
    onToggle: () => toggle(id),
    onSave: () => save([id]),
    onCancel: () => cancel(id),
    onPoint: (on: boolean) => setHovered(on ? id : null),
    onLeave: () => setLeft((n) => n + 1),
    onHold: hold,
    onFocusIn: (on: boolean) => setFocused((f) => (on ? id : f === id ? null : f)),
  });

  // Each section's fields, written once: in the form, and in the card that
  // opens on the page when that part of the PDF is clicked.
  const fromActions =
    company && (
      <button
        type="button"
        className={btnGhost}
        title="This document keeps the company details it was made with. Take the current ones instead."
        onClick={() => {
          // Its bank too, which is Payment details' to save.
          edit('from', { issuer: issuerSnapshot(company) });
          edit('payment', {});
        }}
      >
        Use current company details
      </button>
    );
  const fromBody = (
    <>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{d.issuer.name || 'No company'}</p>
      {d.issuer.address.length > 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{d.issuer.address.filter(Boolean).join(', ')}</p>}
    </>
  );
  const documentBody = (
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
  );
  const clientActions = (
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
  );
  const clientBody = (
    <>
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
      {/* Printed "Attn: name, role" and the email under the address.
          One under another, each the full width (James, 2026-11-03:
          "stack contact name, role, email, so each gets more space"). */}
      <div className="mt-3 grid gap-3">
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
    </>
  );
  // Payment details: none on a delivery note, which has no prices.
  const paymentBody = (
    <div className="grid gap-3 sm:grid-cols-2">
      {d.kind !== 'delivery-note' && (
        <Field label="Payment terms" className="sm:col-span-2">
          <input className={inputCls} value={d.paymentTerms} onChange={(e) => edit('payment', { paymentTerms: e.target.value })} />
        </Field>
      )}
      {/* The bank this document is paid into (James, 2026-11-03: "select
          between multiple banks / make edits directly"): one of the
          company's accounts, or edited here for this document alone.
          Under the payment terms, as on the PDF — not up in From. */}
      {d.kind !== 'delivery-note' && (
        <div className="space-y-2 sm:col-span-2">
          {company && (company.moreBanks?.length ?? 0) > 0 && (
            <Field label="Bank account">
              <select
                className={selectCls}
                value={bankChoice}
                onChange={(e) => {
                  const lines = e.target.value === 'main' ? company.bank : company.moreBanks!.find((b) => b.id === e.target.value)?.lines;
                  if (lines) edit('payment', { issuer: { ...d.issuer, bank: [...lines] } });
                }}
              >
                <option value="main">Main account{company.bank[0] ? ` — ${company.bank[0]}` : ''}</option>
                {company.moreBanks!.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label || b.lines[0] || 'Unnamed account'}
                  </option>
                ))}
                {bankChoice === 'edited' && <option value="edited">Edited for this document</option>}
              </select>
            </Field>
          )}
          <Field label="Bank details on this document" hint="Changes here are for this document only — the company keeps its own.">
            <LinesInput rows={3} value={d.issuer.bank} onChange={(bank) => edit('payment', { issuer: { ...d.issuer, bank } })} />
          </Field>
        </div>
      )}
    </div>
  );

  const termsBody = (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Notes" className="sm:col-span-2">
        <GrowingTextarea className={`${inputCls} resize-y`} rows={3} value={d.notes} onChange={(e) => edit('terms', { notes: e.target.value })} />
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
          <Field label="Currency" hint="Changes the symbol only. To change the amounts too, convert the prices below.">
            <select className={selectCls} value={d.currency} onChange={(e) => edit('terms', { currency: e.target.value as InvoiceDoc['currency'] })}>
              <option value="EUR">Euro (€)</option>
              <option value="GBP">Pound sterling (£)</option>
              <option value="USD">US dollar ($)</option>
            </select>
          </Field>
          <CurrencyConvert
            doc={d}
            onConvert={(r, where) => {
              if (where === 'copy') {
                // What is being edited here is saved first, so the copy is of this document as it reads now.
                save(dirty);
                // In the same project as this one (James, 2026-11-11), so it groups with it.
                void duplicate(doc.id, { currency: r.currency, lines: r.lines, discount: r.discount }, true);
                return;
              }
              snapshot('convert');
              edit('terms', { currency: r.currency });
              edit('lines', { lines: r.lines, discount: r.discount });
            }}
          />
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
  );

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
          <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
            {doc.number}
            {doc.client.name && <span className="font-normal text-slate-500 dark:text-slate-400"> · {doc.client.name}</span>}
          </div>
        </div>
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
        <ShareLink doc={doc} openSignal={shareSignal} pdf={signedCurrent ? signedBlob : undefined} onOpen={() => snapshot('share')} />
        <button type="button" className={btnPrimary} onClick={() => void download()}>
          Download PDF
        </button>
        <MoreMenu label="More for this document">
          {(close) => (
            <>
              <button
                type="button"
                role="menuitem"
                className={menuItem}
                onClick={() => {
                  close();
                  void duplicate(doc.id);
                }}
              >
                Duplicate
              </button>
              {doc.kind !== 'delivery-note' && doc.lines.length > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  className={menuItem}
                  onClick={() => {
                    close();
                    setCustoms(true);
                  }}
                >
                  Customs copy…
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className={`${menuItem} text-red-700 dark:text-red-400`}
                onClick={() => {
                  close();
                  const warn = doc.kind === 'invoice'
                    ? `Delete invoice ${doc.number}? This cannot be undone — and if it was sent, invoice numbers are expected to run without gaps.`
                    : `Delete ${KIND_NAMES[doc.kind].toLowerCase()} ${doc.number}? This cannot be undone.`;
                  if (confirmAction(warn)) void deleteMany('documents', [doc.id]);
                }}
              >
                Delete
              </button>
            </>
          )}
        </MoreMenu>
      </div>

      {customs && (
        <CustomsCopy
          doc={d}
          onClose={() => setCustoms(false)}
          onMake={(r) => {
            // What is being edited is saved first, so the copy is of this document as it reads now.
            save(dirty);
            setCustoms(false);
            void duplicate(doc.id, { lines: r.lines, discount: r.discount }, true);
          }}
        />
      )}

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
      {frenchEInvoicing(d) && !frenchNoteSeen && (
        // lib/france.ts: the reform covers an invoice from a business in France to one in France.
        <div role="note" className="flex flex-wrap items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="min-w-0 flex-1">
            <strong>Invoicing a business in France from France?</strong> Under the French e-invoicing rules, this PDF on its own is not a valid invoice between two French businesses: from 1 September 2027 for small businesses and sole traders, and already for larger ones. Send the invoice through your approved e-invoicing platform (plateforme agréée). If you invoice there, you can hide invoices here in Tune this app.
          </p>
          <button type="button" className={btnGhost} onClick={() => setPref(FRENCH_NOTE_SEEN, true)}>
            Got it
          </button>
        </div>
      )}

      <DocumentJourney
        doc={doc}
        versions={
          <DocumentVersions
            doc={doc}
            onSave={(name) => snapshot('manual', name)}
            onRestore={(id) => {
              save(dirty);
              updateDocument(restoreVersion(savedNow(), id));
              useAppStore.setState({ notice: 'Restored. How it read before is the newest version, if you want it back.' });
            }}
            onRemove={(id) => updateDocument(removeVersion(savedNow(), id))}
          />
        }
      />

      {/* Phone: one pane at a time. */}
      <div className="u-tabs w-full lg:hidden" role="tablist" aria-label="Pane">
        {(['edit', 'preview'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pane === p}
            onClick={() => setPane(p)}
            className="u-tab flex-1 justify-center"
          >
            {p === 'edit' ? 'Edit' : 'Preview'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={`space-y-4 ${pane === 'edit' ? '' : 'hidden lg:block'}`}>
          {/* From, first (James, 2026-10-30): who the document is from decides
              everything under it. Not a choice here (2026-10-31): a document
              comes from the active company, picked in Your companies. */}
          <Section
            {...section('from')}
            title="From"
            summary={d.issuer.name || 'No company'}
            actions={fromActions}
          >
            {fromBody}
          </Section>

          <Section {...section('document')} title="Document" summary={[d.number, d.subject].filter(Boolean).join(' · ')}>
            {documentBody}
          </Section>

          <Section
            {...section('client')}
            title="Client"
            summary={d.client.name || 'No client yet'}
            actions={clientActions}
          >
            {clientBody}
          </Section>

          <Section
            {...section('lines')}
            title="Lines"
            summary={`${d.lines.length} line${d.lines.length === 1 ? '' : 's'}${d.kind === 'delivery-note' ? '' : ` · ${formatMoney(computeTotals(d).gross, d.currency, d.numberStyle, true)}`}`}
          >
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              {onPage ? 'Click a line to edit it on the preview, or drag it there to move it.' : 'Tap a line to edit it. Under Preview, tap one there, or hold it and drag to move it.'}
            </p>
            <LinesSummary
              doc={d}
              open={onPage ? lineOpen : formLine}
              editor={onPage ? null : lineEditor(formLine, setFormLine, () => {
                saveLines();
                setFormLine(null);
              })}
              onOpen={openFromList}
              onDiscount={(discount) => edit('lines', { discount })}
              actions={
                <>
                  <button type="button" className={btnGhost} onClick={addBlank}>
                    + Add line
                  </button>
                  {catalogue.length > 0 && (
                    <button type="button" className={btnGhost} onClick={() => setPicking(true)} aria-haspopup="dialog">
                      + From catalogue
                    </button>
                  )}
                  {!onPage && removedChip}
                </>
              }
            />
            {/* What each line prints besides its description (James, 2026-11-11):
                units are off unless asked for; the origin comes from the catalogue. */}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700 dark:text-slate-300">
              <label className="flex items-center gap-2">
                <input type="checkbox" className={checkboxCls} checked={!!d.showUnits} onChange={(e) => edit('lines', { showUnits: e.target.checked || undefined })} />
                Show units
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className={checkboxCls} checked={!!d.showOrigin} onChange={(e) => edit('lines', { showOrigin: e.target.checked || undefined })} />
                Show the country of origin
              </label>
            </div>
          </Section>

          {d.kind !== 'delivery-note' && (
            <Section {...section('payment')} title="Payment details" summary={d.paymentTerms || d.issuer.bank[0]}>
              {paymentBody}
            </Section>
          )}

          <Section {...section('terms')} title="Notes and more" summary={d.notes.split('\n')[0]}>
            {termsBody}
          </Section>
        </div>

        <div className={`${pane === 'preview' ? '' : 'hidden lg:block'}`}>
          <div className="lg:sticky lg:top-4">
            <PdfPreview
              doc={doc}
              highlight={pointed ? PDF_PARTS[pointed] : null}
              file={signedCurrent ? signedBlob : undefined}
              hovered={overSection ? PDF_PARTS[overSection] : null}
              onHover={setOverPart}
              onPick={openFromPdf}
              parts={{
                editable: ON_PAGE_PARTS,
                open: partOpen,
                onOpen: openPart,
                onLeave: savePart,
                editor: partSection && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`${sectionTitle} mr-auto`}>{partSection === 'lines' ? 'Totals' : SECTION_TITLES[partSection]}</h3>
                      {partSection === 'from' ? fromActions : partSection === 'client' ? clientActions : null}
                    </div>
                    {partSection === 'lines' ? <TotalsFields doc={d} onDiscount={(discount) => edit('lines', { discount })} /> : partSection === 'from' ? fromBody : partSection === 'document' ? documentBody : partSection === 'client' ? clientBody : partSection === 'payment' ? paymentBody : termsBody}
                    {partSection === 'from' && <p className="text-xs text-slate-500 dark:text-slate-400">The company’s own details are changed in Your companies.</p>}
                    <div className="flex justify-end">
                      <button type="button" className={btnPrimary} onClick={() => openPart(null)}>
                        Done
                      </button>
                    </div>
                  </div>
                ),
              }}
              lines={{
                open: lineOpen !== null && lineOpen < d.lines.length ? lineOpen : null,
                onOpen: openLine,
                onLeave: saveLines,
                onMoveTo: moveLine,
                editor: lineEditor(lineOpen, setLineOpen, () => openLine(null)),
                add: (
                  <>
                    <button type="button" className={`${btnGhost} bg-white/90 py-1 text-xs dark:bg-slate-900/90`} onClick={() => addLine(blankLine(d.taxMode === 'standard' ? (company?.defaults.taxRate ?? 20) : undefined))}>
                      + Add line
                    </button>
                    {catalogue.length > 0 && (
                      <button type="button" className={`${btnGhost} bg-white/90 py-1 text-xs dark:bg-slate-900/90`} onClick={() => setPicking(true)} aria-haspopup="dialog">
                        + From catalogue
                      </button>
                    )}
                    {removedChip}
                  </>
                ),
              }}
            />
          </div>
        </div>
      </div>

      {picking && (
        <CataloguePicker
          catalogue={catalogue}
          folders={folders}
          doc={d}
          onAdd={(p) => edit('lines', { lines: [...draft.lines, lineFromProduct(p)] })}
          onClose={() => {
            setPicking(false);
            if (dirty.has('lines')) save(['lines']);
          }}
        />
      )}

      {/* Unsaved edits, wherever you are on the page: what, and Save all. */}
      {dirty.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]">
          <div className="pointer-events-auto flex max-w-full items-center gap-3 whitespace-nowrap rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-lg ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800">
            <span className="min-w-0 truncate">
              Unsaved: {SECTIONS.filter((x) => dirty.has(x)).map((x) => SECTION_TITLES[x]).join(', ')}
              <span className="hidden sm:inline"> — not in the preview yet</span>
            </span>
            <button type="button" className={`${btnPrimary} shrink-0 u-btn--sm`} onClick={() => save(dirty)}>
              Save all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const TEXT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'number', 'password']);

const isTextBox = (el: Element | null): el is HTMLElement => el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type));

/** Whether a section is still being worked in: the cursor is in the box its edit was typed in, or on its Cancel (reached with Tab). */
function stillIn(section: SectionId, box: Element | null | undefined): boolean {
  const el = document.activeElement;
  if (box && el === box) return true;
  return el instanceof HTMLElement && el.hasAttribute('data-keep') && el.closest('[data-section]')?.getAttribute('data-section') === section;
}

/**
 * A form section: a header that folds it away (with a one-line summary while
 * folded), its own Save and Cancel once something in it has changed, and the
 * hover / focus that marks its part of the preview.
 */
function Section({
  id,
  title,
  summary,
  actions,
  children,
  dirty,
  collapsed,
  marked,
  onToggle,
  onSave,
  onCancel,
  onPoint,
  onFocusIn,
  onLeave,
  onHold,
}: {
  id: SectionId;
  title: string;
  summary: string;
  actions?: ReactNode;
  children: ReactNode;
  dirty: boolean;
  collapsed: boolean;
  /** Its part of the PDF is under the pointer on the preview. */
  marked: boolean;
  onToggle: () => void;
  onSave: () => void;
  onCancel: () => void;
  onPoint: (on: boolean) => void;
  onFocusIn: (on: boolean) => void;
  /** Focus moved within or out of the section: time to see whether it saves. */
  onLeave: () => void;
  /** A press on Cancel is starting: don't save under it. */
  onHold: () => void;
}) {
  const body = useId();
  return (
    <section
      className={`${card} scroll-mt-4 transition-shadow ${dirty ? 'ring-2 ring-amber-300 dark:ring-amber-800' : marked ? 'ring-2 ring-orange-300 dark:ring-orange-800' : ''}`}
      onMouseEnter={() => onPoint(true)}
      onMouseLeave={() => onPoint(false)}
      onFocus={() => onFocusIn(true)}
      data-section={id}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onFocusIn(false);
        onLeave();
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
            <button type="button" className={`${btnGhost} u-btn--sm`} data-keep onPointerDown={onHold} onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className={`${btnPrimary} u-btn--sm`} onClick={onSave}>
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
