// The app's stored records. The PDF model (`BusinessDoc`) lives in
// @unisim/doc; these are what sit in IndexedDB, and `toBusinessDoc` in
// `convert.ts` is the one bridge between the two.

import type {
  BusinessDocKind,
  BusinessDocLanguage,
  CurrencyCode,
  NumberStyle,
  TaxMode,
} from '@unisim/doc';

export type { BusinessDocKind, BusinessDocLanguage, CurrencyCode, NumberStyle, TaxMode };

/** A picture already converted to JPEG (white behind any transparency). */
export interface StoredImage {
  /** `data:image/jpeg;base64,…` */
  dataUrl: string;
  width: number;
  height: number;
}

export interface Numbering {
  /** Tokens: {YYYY} {YY} {MM} {DD} {N} {N:5} (zero-padded to 5). */
  pattern: string;
  /** The number the NEXT document of this kind gets. */
  next: number;
}

export interface CompanyDefaults {
  language: BusinessDocLanguage;
  numberStyle: NumberStyle;
  currency: CurrencyCode;
  taxMode: TaxMode;
  taxNote: string;
  /** Percent, for `standard`. */
  taxRate: number;
  paymentTerms: string;
  notes: string;
  /** Quotes, estimates and pro formas: valid-until = date + this. */
  validityDays: number;
  /** Invoices: due date = date + this. */
  dueDays: number;
}

/** A company you send documents from. You may have more than one. */
export interface Company {
  id: string;
  /**
   * The built-in example (lib/example.ts) — one of each kind at most, shown
   * with an Example chip and a dashed border, and deleted as soon as you make
   * a real one of the same kind (James, 2026-10-30).
   */
  example?: boolean;
  /**
   * The Universal ID company this one was brought in from (the hub's My
   * Company → Business details). Set once; "Update from your company" refreshes
   * the details it knows and leaves the rest alone.
   */
  orgId?: string;
  name: string;
  logo?: StoredImage;
  address: string[];
  contact: { name: string; phone: string; email: string };
  bank: string[];
  footer: string[];
  defaults: CompanyDefaults;
  numbering: Record<BusinessDocKind, Numbering>;
  updatedAt: number;
}

export interface Client {
  id: string;
  /**
   * The built-in example (lib/example.ts) — one of each kind at most, shown
   * with an Example chip and a dashed border, and deleted as soon as you make
   * a real one of the same kind (James, 2026-10-30).
   */
  example?: boolean;
  name: string;
  address: string[];
  /** Their number in your books ("No. client"). */
  reference: string;
  email: string;
  updatedAt: number;
}

export interface Product {
  id: string;
  /**
   * The built-in example (lib/example.ts) — one of each kind at most, shown
   * with an Example chip and a dashed border, and deleted as soon as you make
   * a real one of the same kind (James, 2026-10-30).
   */
  example?: boolean;
  code: string;
  description: string;
  unit: string;
  /** Minor units. */
  unitPrice: number;
  /** Minor units; printed struck through when higher than `unitPrice`. */
  listPrice?: number;
  taxRate?: number;
  image?: StoredImage;
  updatedAt: number;
}

export interface DocLine {
  id: string;
  /** The catalogue item it came from, if any — a hint, never re-read. */
  productId?: string;
  image?: StoredImage;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  listPrice?: number;
  taxRate?: number;
}

export type DocStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'paid' | 'cancelled';

/**
 * A document. The issuer and the client are SNAPSHOTS, taken when the
 * document is created: a quote you sent in July must not change because you
 * moved office in October. "Refresh from company/client" re-takes them on
 * purpose.
 */
export interface InvoiceDoc {
  id: string;
  /**
   * The built-in example (lib/example.ts) — one of each kind at most, shown
   * with an Example chip and a dashed border, and deleted as soon as you make
   * a real one of the same kind (James, 2026-10-30).
   */
  example?: boolean;
  kind: BusinessDocKind;
  status: DocStatus;
  companyId: string;
  issuer: Omit<Company, 'id' | 'defaults' | 'numbering' | 'updatedAt'>;
  clientId?: string;
  client: { name: string; address: string[]; reference: string };
  number: string;
  date: string;
  validUntil?: string;
  dueDate?: string;
  subject: string;
  language: BusinessDocLanguage;
  numberStyle: NumberStyle;
  currency: CurrencyCode;
  taxMode: TaxMode;
  taxNote: string;
  lines: DocLine[];
  notes: string;
  paymentTerms: string;
  /** Undefined = the kind's default (on for quotes, estimates, delivery notes). */
  signature?: boolean;
  /** The document this one was made from ("Convert to invoice"). */
  sourceId?: string;
  createdAt: number;
  updatedAt: number;
}

export const KIND_ORDER: BusinessDocKind[] = ['quote', 'estimate', 'proforma', 'invoice', 'delivery-note'];

/** UI names — the app's own language is English; the PDF's is per document. */
export const KIND_NAMES: Record<BusinessDocKind, string> = {
  quote: 'Quote',
  estimate: 'Estimate',
  proforma: 'Pro forma',
  invoice: 'Invoice',
  'delivery-note': 'Delivery note',
};

export const STATUS_NAMES: Record<DocStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  paid: 'Paid',
  cancelled: 'Cancelled',
};
