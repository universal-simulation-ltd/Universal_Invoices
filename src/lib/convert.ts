// Stored records → the @unisim/doc model, and the document lifecycle helpers
// (new, convert, refresh). Pure: no IndexedDB, no DOM — the tests run it in Node.

import type { BusinessDoc, PdfImage } from '@unisim/doc';
import { addDays, formatNumber } from './numbering';
import type { BusinessDocKind, Client, Company, DocLine, InvoiceDoc, StoredImage } from './types';

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
    },
    lines: doc.lines.map((l) => ({
      image: imageOf(l.image),
      code: l.code,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit.trim() || undefined,
      unitPrice: l.unitPrice,
      listPrice: l.listPrice,
      taxRate: l.taxRate,
    })),
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
  return { name: client.name, address: [...client.address], reference: client.reference };
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
      client: { ...source.client, address: [...source.client.address] },
      subject: source.subject,
      language: source.language,
      numberStyle: source.numberStyle,
      currency: source.currency,
      taxMode: source.taxMode,
      taxNote: source.taxNote,
      lines: source.lines.map((l) => ({ ...l, id: uid() })),
      notes: source.notes,
      paymentTerms: source.paymentTerms,
      sourceId: source.id,
    },
  };
}

/** A copy with a fresh number — "Duplicate". Status goes back to draft. */
export function duplicateDocument(source: InvoiceDoc, company: Company, date: string): { doc: InvoiceDoc; company: Company } {
  const out = convertDocument(source, source.kind, company, date);
  return { ...out, doc: { ...out.doc, sourceId: undefined } };
}

export function lineFromProduct(p: { id: string } & Omit<DocLine, 'id' | 'quantity' | 'productId'>): DocLine {
  return {
    id: uid(),
    productId: p.id,
    image: p.image,
    code: p.code,
    description: p.description,
    quantity: 1,
    unit: p.unit,
    unitPrice: p.unitPrice,
    listPrice: p.listPrice,
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
