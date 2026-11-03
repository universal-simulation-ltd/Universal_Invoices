// Stored records → the @unisim/doc model, and the document lifecycle helpers
// (new, convert, refresh). Pure: no IndexedDB, no DOM — the tests run it in Node.

import type { BusinessDoc, PdfImage } from '@unisim/doc';
import { addDays, counterAfter, defaultNumbering, formatNumber } from './numbering';
import type { ReadDocument } from './readPdf';
import type { Attachment, BusinessDocKind, Client, Company, DocLine, InvoiceDoc, Product, StoredImage } from './types';

export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function imageOf(stored: StoredImage | undefined): PdfImage | null {
  if (!stored) return null;
  const base64 = stored.dataUrl.slice(stored.dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const jpeg = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) jpeg[i] = binary.charCodeAt(i);
  return { jpeg, width: stored.width, height: stored.height };
}

/** Blank lines drop out of the printed address blocks. */
const lines = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);

export function toBusinessDoc(doc: InvoiceDoc): BusinessDoc {
  const { issuer } = doc;
  return {
    kind: doc.kind,
    language: doc.language,
    numberStyle: doc.numberStyle,
    currency: doc.currency,
    taxMode: doc.taxMode,
    taxNote: doc.taxNote.trim() || undefined,
    number: doc.number,
    date: doc.date,
    validUntil: doc.validUntil,
    dueDate: doc.dueDate,
    subject: doc.subject.trim() || undefined,
    issuer: {
      name: issuer.name,
      logo: imageOf(issuer.logo),
      address: lines(issuer.address),
      contact: issuer.contact,
      bank: lines(issuer.bank),
      footer: lines(issuer.footer),
    },
    client: {
      name: doc.client.name,
      address: lines(doc.client.address),
      reference: doc.client.reference.trim() || undefined,
      contact: doc.client.contact,
    },
    lines: doc.lines.map((l) => ({
      image: imageOf(l.image),
      code: l.code,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit.trim() || undefined,
      unitPrice: l.unitPrice,
      discount: l.discount,
      taxRate: l.taxRate,
    })),
    discount: doc.discount,
    notes: doc.notes.trim() || undefined,
    paymentTerms: doc.paymentTerms.trim() || undefined,
    signature: doc.signature,
  };
}

export function issuerSnapshot(company: Company): InvoiceDoc['issuer'] {
  const { name, logo, address, contact, bank, footer } = company;
  return { name, logo, address: [...address], contact: { ...contact }, bank: [...bank], footer: [...footer] };
}

export function clientSnapshot(client: Client): InvoiceDoc['client'] {
  const contact = { name: client.contact?.name ?? '', role: client.contact?.role ?? '', email: client.email };
  return {
    name: client.name,
    address: [...client.address],
    reference: client.reference,
    ...(contact.name || contact.role || contact.email ? { contact } : {}),
  };
}

/** A document's client, saved to Clients ("Save to clients"). */
export function clientFromSnapshot(snapshot: InvoiceDoc['client'], id = uid()): Client {
  const { contact, ...rest } = snapshot;
  return {
    id,
    ...rest,
    address: [...rest.address],
    ...(contact?.name || contact?.role ? { contact: { name: contact.name, role: contact.role } } : {}),
    email: contact?.email ?? '',
    updatedAt: Date.now(),
  };
}

/** Kind-specific dates: a validity for offers, a due date for invoices. */
function datesFor(kind: BusinessDocKind, date: string, company: Company): Pick<InvoiceDoc, 'validUntil' | 'dueDate'> {
  if (kind === 'invoice') return { dueDate: addDays(date, company.defaults.dueDays) };
  if (kind === 'delivery-note') return {};
  return { validUntil: addDays(date, company.defaults.validityDays) };
}

/**
 * A new, numbered document. Returns the company with its counter advanced —
 * the caller saves both, so a number is never handed out twice.
 */
export function newDocument(
  kind: BusinessDocKind,
  company: Company,
  date: string,
  client?: Client,
): { doc: InvoiceDoc; company: Company } {
  const numbering = company.numbering[kind];
  const now = Date.now();
  const d = company.defaults;
  const doc: InvoiceDoc = {
    id: uid(),
    kind,
    status: 'draft',
    companyId: company.id,
    issuer: issuerSnapshot(company),
    clientId: client?.id,
    client: client ? clientSnapshot(client) : { name: '', address: [], reference: '' },
    number: formatNumber(numbering.pattern, date, numbering.next),
    date,
    ...datesFor(kind, date, company),
    subject: '',
    language: d.language,
    numberStyle: d.numberStyle,
    currency: d.currency,
    taxMode: d.taxMode,
    taxNote: d.taxMode === 'standard' ? '' : d.taxNote,
    lines: [],
    notes: d.notes,
    paymentTerms: d.paymentTerms,
    createdAt: now,
    updatedAt: now,
  };
  return {
    doc,
    company: { ...company, numbering: { ...company.numbering, [kind]: { ...numbering, next: numbering.next + 1 } }, updatedAt: now },
  };
}

/**
 * "Convert to invoice" (or delivery note, or pro forma): a NEW document with
 * its own number, carrying the lines, client and terms across, and pointing
 * back at its source. The source is left as it was.
 */
export function convertDocument(
  source: InvoiceDoc,
  kind: BusinessDocKind,
  company: Company,
  date: string,
): { doc: InvoiceDoc; company: Company } {
  const fresh = newDocument(kind, company, date);
  return {
    company: fresh.company,
    doc: {
      ...fresh.doc,
      issuer: source.issuer,
      clientId: source.clientId,
      client: { ...source.client, address: [...source.client.address], ...(source.client.contact ? { contact: { ...source.client.contact } } : {}) },
      subject: source.subject,
      language: source.language,
      numberStyle: source.numberStyle,
      currency: source.currency,
      taxMode: source.taxMode,
      taxNote: source.taxNote,
      lines: source.lines.map((l) => ({ ...l, id: uid() })),
      ...(source.discount ? { discount: { ...source.discount } } : {}),
      notes: source.notes,
      paymentTerms: source.paymentTerms,
      sourceId: source.id,
    },
  };
}

/**
 * The next step, started fresh (James, 2026-11-03: "ask the user if they want
 * to start fresh or base the information on the previous step"): a new,
 * numbered document from the company's current details and defaults, with
 * only the client carried over — and still linked into the journey.
 */
export function freshDocument(source: InvoiceDoc, kind: BusinessDocKind, company: Company, date: string): { doc: InvoiceDoc; company: Company } {
  const out = newDocument(kind, company, date);
  return {
    company: out.company,
    doc: {
      ...out.doc,
      clientId: source.clientId,
      client: { ...source.client, address: [...source.client.address], ...(source.client.contact ? { contact: { ...source.client.contact } } : {}) },
      sourceId: source.id,
    },
  };
}

/** A copy with a fresh number — "Duplicate". Status goes back to draft. */
export function duplicateDocument(source: InvoiceDoc, company: Company, date: string): { doc: InvoiceDoc; company: Company } {
  const out = convertDocument(source, source.kind, company, date);
  return { ...out, doc: { ...out.doc, sourceId: undefined } };
}

export function lineFromProduct(p: { id: string } & Omit<DocLine, 'id' | 'quantity' | 'productId' | 'discount'>): DocLine {
  return {
    id: uid(),
    productId: p.id,
    image: p.image,
    code: p.code,
    description: p.description,
    quantity: 1,
    unit: p.unit,
    unitPrice: p.unitPrice,
    taxRate: p.taxRate,
  };
}

export function blankLine(taxRate?: number): DocLine {
  return { id: uid(), code: '', description: '', quantity: 1, unit: '', unitPrice: 0, taxRate };
}

/** "DEV-20260727-00406 - Medical Simulation Consultant.pdf", safe on every OS. */
export function pdfFileName(doc: InvoiceDoc): string {
  const base = [doc.number, doc.client.name].filter(Boolean).join(' - ') || 'document';
  return `${base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)}.pdf`;
}

/** Names compared the way people type them: no case, accents or punctuation. */
const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Your company the PDF is from, by name — the active one when none matches. */
export function companyForImport(read: ReadDocument, mine: Company[], active?: Company): Company | undefined {
  const names = [read.issuer.name, ...read.issuer.footer.slice(0, 1)].map(plain).filter(Boolean);
  return mine.find((c) => names.includes(plain(c.name))) ?? active ?? mine[0];
}

/** A company made from the sender of an imported PDF, when you have none yet. */
export function companyFromRead(read: ReadDocument, now = Date.now()): Company {
  return {
    id: uid(),
    name: read.issuer.name || 'Your company',
    address: read.issuer.address,
    contact: read.issuer.contact,
    bank: read.issuer.bank,
    footer: read.issuer.footer,
    defaults: {
      language: read.language,
      numberStyle: read.numberStyle,
      currency: read.currency ?? 'EUR',
      taxMode: read.taxRate ? 'standard' : 'export-exempt',
      taxNote: '',
      taxRate: read.taxRate ?? 20,
      paymentTerms: read.paymentTerms,
      notes: '',
      validityDays: 30,
      dueDays: 30,
    },
    numbering: defaultNumbering(read.language),
    updatedAt: now,
  };
}

/**
 * "Import PDF": a document from what readPdf found. It keeps the PDF's own
 * number — and moves the company's counter past it when it fits the
 * pattern — and the PDF itself, to check against. The sender is your
 * company's details when it matched by name, else what the PDF printed.
 */
export function importedDocument(
  read: ReadDocument,
  company: Company,
  file: Attachment | undefined,
  fallbackKind: BusinessDocKind,
  today: string,
): { doc: InvoiceDoc; company: Company } {
  const kind = read.kind ?? fallbackKind;
  const fresh = newDocument(kind, company, read.date ?? today);
  const matched = plain(company.name) === plain(read.issuer.name) || plain(company.name) === plain(read.issuer.footer[0] ?? '');
  const taxMode = read.taxRate ? 'standard' : company.defaults.taxMode === 'standard' ? 'export-exempt' : company.defaults.taxMode;
  const number = read.number || fresh.doc.number;
  const now = Date.now();
  const doc: InvoiceDoc = {
    ...fresh.doc,
    status: 'sent',
    issuer: matched || !read.issuer.name ? fresh.doc.issuer : { ...read.issuer, address: [...read.issuer.address], bank: [...read.issuer.bank], footer: [...read.issuer.footer] },
    client: { name: read.client.name, address: read.client.address, reference: read.client.reference, ...(read.client.contact ? { contact: read.client.contact } : {}) },
    number,
    validUntil: kind === 'invoice' || kind === 'delivery-note' ? undefined : (read.validUntil ?? fresh.doc.validUntil),
    dueDate: kind === 'invoice' ? (read.dueDate ?? fresh.doc.dueDate) : undefined,
    subject: read.subject,
    language: read.language,
    numberStyle: read.numberStyle,
    currency: read.currency ?? fresh.doc.currency,
    taxMode,
    taxNote: taxMode === 'standard' ? '' : fresh.doc.taxNote,
    lines: read.lines.map((l) => ({ id: uid(), ...l, ...(read.taxRate ? { taxRate: read.taxRate } : {}) })),
    ...(read.discount ? { discount: read.discount } : {}),
    notes: read.notes,
    paymentTerms: read.paymentTerms || fresh.doc.paymentTerms,
    ...(file ? { imported: { file, statedTotal: read.statedTotal, checked: false } } : {}),
    createdAt: now,
    updatedAt: now,
  };
  if (!doc.validUntil) delete doc.validUntil;
  if (!doc.dueDate) delete doc.dueDate;
  // Its own number, not the next one: the counter only moves past it.
  const numbering = read.number ? counterAfter(company.numbering[kind], read.number) : fresh.company.numbering[kind];
  return { doc, company: { ...company, numbering: { ...company.numbering, [kind]: numbering }, updatedAt: now } };
}

/**
 * Imported lines take their picture from the catalogue item with the same
 * code (James, 2026-11-03: "choose item images from their catalogue") — a
 * PDF's pictures are not read back. Lines that match nothing are left for
 * you to pick one for.
 */
export function withCataloguePictures(lines: DocLine[], products: Product[]): DocLine[] {
  const byCode = new Map(products.filter((p) => p.code.trim() && p.image).map((p) => [p.code.trim().toLowerCase(), p]));
  return lines.map((l) => {
    const p = !l.image && l.code.trim() ? byCode.get(l.code.trim().toLowerCase()) : undefined;
    return p ? { ...l, image: p.image, productId: p.id } : l;
  });
}
