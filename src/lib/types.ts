// The app's stored records. The PDF model (`BusinessDoc`) lives in
// @unisim/doc; these are what sit in IndexedDB, and `toBusinessDoc` in
// `convert.ts` is the one bridge between the two.

import type {
  BusinessDiscount,
  BusinessDocKind,
  BusinessDocLanguage,
  CurrencyCode,
  NumberStyle,
  TaxMode,
} from '@unisim/doc';

export type { BusinessDocKind, BusinessDocLanguage, CurrencyCode, NumberStyle, TaxMode };

/**
 * A percentage, or an amount in minor units — per unit on a line, off the
 * subtotal on a whole document (James, 2026-11-03: "remove list price,
 * instead catalogue price, and then later discount by item or for the whole
 * transaction"). Replaces the old struck-through list price: lib/legacy.ts
 * turns one into the other.
 */
export type Discount = BusinessDiscount;

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
   * Company → Business details). LIVE while you are signed in to it: the
   * details the hub knows follow it (OrgSync.tsx); Duplicate makes a copy that
   * does not.
   */
  orgId?: string;
  /** The hub logo `logo` was made from — re-fetched only when the hub's changes. */
  orgLogoUrl?: string;
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
  /** The person documents are for — printed "Attn: name, role" under the address (James, 2026-11-03). */
  contact?: { name: string; role: string };
  /** The contact's email, printed under it. */
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
  /** The catalogue price, minor units. Discounts are given on documents. */
  unitPrice: number;
  taxRate?: number;
  image?: StoredImage;
  /** The catalogue folder it sits in (lib/arrange.ts); unknown or gone = the top level. */
  folderId?: string;
  /** Its place in its folder or at the top level, dragged into place. None yet = after the placed ones, by code. */
  order?: number;
  updatedAt: number;
}

/**
 * A folder in the catalogue (James, 2026-10-31: "allow click and drag to
 * reorganise catalogue, have option to create a folder and drag items in").
 * One level: folders hold products, not folders. Deleting one moves its
 * products back out — it never deletes them.
 */
export interface Folder {
  id: string;
  name: string;
  /** Its place among the top level's folders and loose products. */
  order?: number;
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
  /** The catalogue price, before this line's discount. Minor units. */
  unitPrice: number;
  /** Off each unit: the PDF prints the catalogue price struck through above the discounted one. */
  discount?: Discount;
  taxRate?: number;
}

/** A document's copy of the client's contact person. */
export interface ClientContact {
  name: string;
  role: string;
  email: string;
}

/** A file kept with a document: an imported PDF, or a step done elsewhere. */
export interface Attachment {
  name: string;
  /** MIME type. */
  type: string;
  /** Bytes, for the size shown beside it. */
  size: number;
  /** `data:…;base64,…` */
  dataUrl: string;
}

/**
 * A step of a document's journey done outside the app (James, 2026-11-03: "if
 * I have done them elsewhere I can upload, generate in platform or just
 * manually tick / mark not needed").
 */
export type JourneyMark =
  | { state: 'uploaded'; file: Attachment; at: number }
  | { state: 'done'; at: number }
  | { state: 'skipped'; at: number };

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
  client: { name: string; address: string[]; reference: string; contact?: ClientContact };
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
  /** Off the whole document, after the lines' own discounts and before tax. */
  discount?: Discount;
  notes: string;
  paymentTerms: string;
  /** Undefined = the kind's default (on for quotes, estimates, delivery notes). */
  signature?: boolean;
  /** The document this one was made from ("Convert to invoice"). */
  sourceId?: string;
  /**
   * The journey's steps that have no document here — uploaded, done
   * elsewhere, or not needed (lib/journey.ts). Kept on the journey's FIRST
   * document only; deleting it hands them to the next one.
   */
  journey?: Partial<Record<BusinessDocKind, JourneyMark>>;
  /**
   * Read from a PDF ("Import PDF"): the file as it came, and the total it
   * printed. Until you tick that the amounts match (`checked`), making
   * another document from it asks first (James, 2026-11-03: "the user will
   * need to verify amount etc").
   */
  imported?: { file: Attachment; statedTotal?: number; checked: boolean };
  createdAt: number;
  updatedAt: number;
}

/**
 * The order of the journey, and so of every list of kinds: a rough estimate,
 * then the firm quote, then pro forma, invoice and delivery note (James,
 * 2026-11-03: "put estimate before quote").
 */
export const KIND_ORDER: BusinessDocKind[] = ['estimate', 'quote', 'proforma', 'invoice', 'delivery-note'];

/** UI names — the app's own language is English; the PDF's is per document. */
export const KIND_NAMES: Record<BusinessDocKind, string> = {
  quote: 'Quote',
  estimate: 'Estimate',
  proforma: 'Pro forma',
  invoice: 'Invoice',
  'delivery-note': 'Delivery note',
};

/** The plural, for the Documents sidebar ("Pro formas", "Delivery notes"). */
export const kindPlural = (kind: BusinessDocKind) => `${KIND_NAMES[kind]}s`;

/**
 * One line on what each kind is for, under its name in the New document menu
 * — few people know an estimate from a pro forma.
 */
export const KIND_HINTS: Record<BusinessDocKind, string> = {
  quote: 'A fixed price you are offering. Once accepted, it becomes the invoice.',
  estimate: 'A rough price that may change once the work is done.',
  proforma: 'An invoice in advance, to be paid before you deliver.',
  invoice: 'A request for payment for work done or goods sent.',
  'delivery-note': 'What was delivered, without prices, for the customer to sign.',
};

export const STATUS_NAMES: Record<DocStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  paid: 'Paid',
  cancelled: 'Cancelled',
};
