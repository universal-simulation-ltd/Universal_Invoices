// Stored records → the @unisim/doc model, and the document lifecycle helpers
// (new, convert, refresh). Pure: no IndexedDB, no DOM — the tests run it in Node.

import type { BusinessDoc, PdfImage } from '@unisim/doc';
import { addDays, counterAfter, defaultNumbering, formatNumber } from './numbering';
import type { ReadDocument } from './readPdf';
import { printedUnit, unitOf } from './units';
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

/** "Origin: France" / "Origine : France", in the document's language. */
const ORIGIN_LABEL: Record<InvoiceDoc['language'], string> = { en: 'Origin: ', fr: 'Origine : ' };

/**
 * A line's description as printed: with its country of origin on a line of
 * its own underneath, when the document shows origins. @unisim/doc has no
 * origin column, and a narrow column for a word or two would cost the
 * description its room.
 */
export function printedDescription(line: Pick<DocLine, 'description' | 'origin'>, doc: Pick<InvoiceDoc, 'showOrigin' | 'language'>): string {
  const origin = doc.showOrigin ? line.origin?.trim() : '';
  if (!origin) return line.description;
  return [line.description.replace(/\s+$/, ''), `${ORIGIN_LABEL[doc.language]}${origin}`].filter(Boolean).join('\n');
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
      description: printedDescription(l, doc),
      quantity: l.quantity,
      // Units print only when the document asks for them (James, 2026-11-11).
      unit: doc.showUnits ? printedUnit(l.unit, l.quantity, doc.language) : undefined,
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
    ...(d.showUnits ? { showUnits: true } : {}),
    ...(d.showOrigin ? { showOrigin: true } : {}),
    createdAt: now,
    updatedAt: now,
  };
  return {
    doc,
    company: { ...company, numbering: { ...company.numbering, [kind]: { ...numbering, next: numbering.next + 1 } }, updatedAt: now },
  };
}

/**
 * "Convert to invoice" (or delivery note, or proforma): a NEW document with
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
      showUnits: source.showUnits,
      showOrigin: source.showOrigin,
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

/**
 * A copy with a fresh number — "Duplicate". Status goes back to draft. On its
 * own it starts a project of its own; `sameProject` keeps it in the source's
 * (the copy in another currency and the customs copy — James, 2026-11-11:
 * "when creating a duplicate of a document in another currency, keep it
 * within the same group of documents").
 */
export function duplicateDocument(source: InvoiceDoc, company: Company, date: string, sameProject = false): { doc: InvoiceDoc; company: Company } {
  const out = convertDocument(source, source.kind, company, date);
  return { ...out, doc: { ...out.doc, sourceId: sameProject ? source.id : undefined } };
}

/**
 * A whole project copied (James, 2026-11-10: "when ticking a grouped project
 * and making a duplicate, make a duplicate of the grouped project not just the
 * individual documents"): each document gets a fresh number, and each copy
 * points back at the COPY of its source, so the copies form their own journey
 * beside the original. A source outside `sources` leaves its copy as the new
 * project's start. "Not needed" marks come along (they describe the project's
 * shape); uploads and "done elsewhere" describe what happened to the original,
 * so they stay behind. `companies` is threaded so the numbers run on.
 */
export function duplicateJourney(
  sources: InvoiceDoc[],
  companies: Company[],
  date: string,
): { docs: InvoiceDoc[]; companies: Company[] } {
  const ordered = [...sources].sort((a, b) => a.createdAt - b.createdAt);
  const byCompany = new Map(companies.map((c) => [c.id, c]));
  const newId = new Map<string, string>();
  const docs: InvoiceDoc[] = [];
  ordered.forEach((source, i) => {
    const company = byCompany.get(source.companyId);
    if (!company) return;
    const out = duplicateDocument(source, company, date);
    byCompany.set(company.id, out.company);
    const sourceCopy = source.sourceId ? newId.get(source.sourceId) : undefined;
    const skipped = Object.fromEntries(Object.entries(source.journey ?? {}).filter(([, m]) => m?.state === 'skipped'));
    newId.set(source.id, out.doc.id);
    docs.push({
      ...out.doc,
      // Kept in the original's order: the journey sorts its members by this.
      createdAt: out.doc.createdAt + i,
      ...(sourceCopy ? { sourceId: sourceCopy } : {}),
      ...(!sourceCopy && Object.keys(skipped).length ? { journey: skipped } : {}),
    });
  });
  const touched = new Set(ordered.map((d) => d.companyId));
  return { docs, companies: [...byCompany.values()].filter((c) => touched.has(c.id)) };
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
    ...(p.origin?.trim() ? { origin: p.origin.trim() } : {}),
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
    // A printed "3 jours" comes back as the list's unit, so it prints right in either language.
    lines: read.lines.map((l) => ({ id: uid(), ...l, unit: unitOf(l.unit)?.key ?? l.unit, ...(read.taxRate ? { taxRate: read.taxRate } : {}) })),
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

/**
 * A short fingerprint of everything that is printed — to tell whether a signed
 * copy is still of this document. Not a security measure: the signed PDF is
 * what counts.
 */
export function pdfFingerprint(doc: InvoiceDoc): string {
  const { kind, number, date, validUntil, dueDate, subject, issuer, client, lines, discount, notes, paymentTerms, taxMode, taxNote, currency, language, numberStyle, signature } = doc;
  const printed: unknown[] = [kind, number, date, validUntil, dueDate, subject, issuer, client, lines, discount, notes, paymentTerms, taxMode, taxNote, currency, language, numberStyle, signature];
  // Added 2026-11-11, and only when ticked, so a document signed before then keeps its fingerprint.
  if (doc.showUnits || doc.showOrigin) printed.push({ showUnits: !!doc.showUnits, showOrigin: !!doc.showOrigin });
  const text = JSON.stringify(printed);
  // FNV-1a, 32-bit, twice over (forwards and with a different basis) — plenty to spot a change.
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x811c9dc5) >>> 0;
  }
  return `${a.toString(36)}-${b.toString(36)}-${text.length}`;
}
