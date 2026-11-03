// "Import PDF" (James, 2026-11-03: "have an import document e.g. one in my
// downloads"): a quote, estimate, invoice… made somewhere else, read back into
// a document you can edit. Pure — it works on the positioned text pdf.js
// gives (pdfText.ts), so the tests run it in Node on PDFs this app made.
//
// Tuned to the layout this app prints (the Sellsy one — sender top left, the
// title, date and client top right, a lines table, totals, then label/value
// rows), which is also what the PDFs it replaces look like; anything it can't
// find is left empty for you to fill in, never guessed.

import { BUSINESS_LABELS } from '@unisim/doc';
import { parseDecimal, parseMoney } from './money';
import type { BusinessDocKind, BusinessDocLanguage, CurrencyCode, NumberStyle } from './types';

/** One run of text, as pdf.js gives it. `y` is from the TOP of the page, in points. */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PdfTextPage {
  width: number;
  height: number;
  items: PdfTextItem[];
}

export interface ReadLine {
  code: string;
  description: string;
  quantity: number;
  unit: string;
  /** Minor units. */
  unitPrice: number;
  listPrice?: number;
}

/** What was found. Anything missing is undefined or empty. */
export interface ReadDocument {
  kind?: BusinessDocKind;
  number?: string;
  date?: string;
  validUntil?: string;
  dueDate?: string;
  subject: string;
  issuer: { name: string; address: string[]; contact: { name: string; phone: string; email: string }; bank: string[]; footer: string[] };
  client: { name: string; address: string[]; reference: string };
  lines: ReadLine[];
  notes: string;
  paymentTerms: string;
  language: BusinessDocLanguage;
  numberStyle: NumberStyle;
  currency?: CurrencyCode;
  /** The VAT rate printed with the totals, if any. */
  taxRate?: number;
  /** The total the PDF states — to check the lines against. Minor units. */
  statedTotal?: number;
}

// --- Rows and segments ------------------------------------------------------

/** Runs on one baseline, close enough to read as one phrase. */
interface Seg {
  text: string;
  x: number;
  x2: number;
  y: number;
  h: number;
}
interface Row {
  page: number;
  y: number;
  h: number;
  segs: Seg[];
}

function rowsOf(pages: PdfTextPage[]): Row[] {
  const out: Row[] = [];
  pages.forEach((page, p) => {
    const items = page.items.filter((i) => i.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: { y: number; items: PdfTextItem[] }[] = [];
    for (const it of items) {
      const row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(2, it.height * 0.3));
      if (row) row.items.push(it);
      else rows.push({ y: it.y, items: [it] });
    }
    for (const r of rows.sort((a, b) => a.y - b.y)) {
      const segs: Seg[] = [];
      for (const it of r.items.sort((a, b) => a.x - b.x)) {
        const last = segs[segs.length - 1];
        const h = it.height || 10;
        // A gap of about two letters or less is the same phrase ("Air cargo" + bold "CIF");
        // wider is the next column.
        if (last && it.x - last.x2 < h * 1.5) {
          const glue = it.x - last.x2 > h * 0.15 && !/\s$/.test(last.text) && !/^\s/.test(it.str) ? ' ' : '';
          last.text += glue + it.str;
          last.x2 = Math.max(last.x2, it.x + it.width);
        } else segs.push({ text: it.str, x: it.x, x2: it.x + it.width, y: it.y, h });
      }
      for (const s of segs) s.text = s.text.replace(/\s+/g, ' ').trim();
      out.push({ page: p, y: r.y, h: Math.max(...segs.map((s) => s.h)), segs: segs.filter((s) => s.text) });
    }
  });
  return out.filter((r) => r.segs.length);
}

const rowText = (r: Row) => r.segs.map((s) => s.text).join(' ');

// --- Words ------------------------------------------------------------------

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A printed label without its colon, as a pattern that takes either apostrophe and any spacing. */
const label = (s: string) => esc(s.replace(/\s*:\s*$/, '')).replace(/[’']/g, "['’]").replace(/\s+/g, '\\s*');
const L = [BUSINESS_LABELS.en, BUSINESS_LABELS.fr];
const anyOf = (xs: string[]) => xs.map(label).join('|');

// Longest first, so "Facture pro forma" wins over "Facture" and "Devis estimatif" over "Devis".
const KIND_WORDS: [string, BusinessDocKind][] = (
  [
    ...L.flatMap((l) => (Object.entries(l.kind) as [BusinessDocKind, string][]).map(([k, w]) => [w, k] as [string, BusinessDocKind])),
    ['Quotation', 'quote'],
    ['Proforma invoice', 'proforma'],
    ['Pro forma', 'proforma'],
    ['Proforma', 'proforma'],
    ['Facture proforma', 'proforma'],
    ['Tax invoice', 'invoice'],
    ['Packing list', 'delivery-note'],
    ['Delivery slip', 'delivery-note'],
  ] as [string, BusinessDocKind][]
).sort((a, b) => b[0].length - a[0].length);
const KIND_RE = new RegExp(`^(${KIND_WORDS.map(([w]) => label(w)).join('|')})\\b\\s*(?:n[o°º]\\.?|#|:)?\\s*([A-Za-z0-9][\\w\\-/.]*\\d[\\w\\-/.]*)?`, 'i');
const kindOf = (word: string) => KIND_WORDS.find(([w]) => new RegExp(`^${label(w)}$`, 'i').test(word))?.[1];

const RE = {
  date: new RegExp(`^(?:${anyOf(L.map((l) => l.date))}|issue date|invoice date|date d['’]émission)\\s*:?\\s*(.*)$`, 'i'),
  validUntil: new RegExp(`^(?:${anyOf(L.map((l) => l.validUntil))}|valid to|expiry date|expires|offer valid until|date de validité)\\s*:?\\s*(.*)$`, 'i'),
  dueDate: new RegExp(`^(?:${anyOf(L.map((l) => l.dueDate))}|payment due|date d['’]échéance)\\s*:?\\s*(.*)$`, 'i'),
  clientRef: new RegExp(`^(?:${anyOf(L.map((l) => l.clientRef))}|customer no\\.?|client ref\\.?|réf\\.? client)\\s*:?\\s*(.*)$`, 'i'),
  subject: new RegExp(`^(?:${anyOf(L.map((l) => l.subject))})[\\s:]*(.*)$`, 'i'),
  contact: new RegExp(`^(?:${anyOf(L.map((l) => l.contact))}|contact)\\s*:\\s*(.*)$`, 'i'),
  phone: new RegExp(`^(?:${anyOf(L.map((l) => l.phone))}|tel\\.?|tél\\.?|téléphone|telephone)\\s*:\\s*(.*)$`, 'i'),
  email: new RegExp(`^(?:${anyOf(L.map((l) => l.email))}|e-?mail)\\s*:\\s*(.*)$`, 'i'),
  terms: new RegExp(`^(?:${anyOf(L.map((l) => l.paymentTerms))}|payment terms|conditions de règlement)\\s*:?\\s*(.*)$`, 'i'),
  bank: new RegExp(`^(?:${anyOf(L.map((l) => l.bank))}|bank details|coordonnées bancaires)\\s*:?\\s*(.*)$`, 'i'),
  notes: new RegExp(`^(?:${anyOf(L.map((l) => l.notes))}|remarques?)\\s*:?\\s*(.*)$`, 'i'),
  totalDue: new RegExp(`^(?:${anyOf(L.map((l) => l.totalDue))}|total ttc|amount due|balance due)\\s*:?$`, 'i'),
  total: /^(?:total|grand total)\s*:?$/i,
  totalNet: new RegExp(`^(?:${anyOf(L.map((l) => l.totalNet))}|sub-?total|total net)\\s*:?$`, 'i'),
  tax: /^(?:vat|tva|tax)\s*(\d+(?:[.,]\d+)?)\s*%/i,
  signature: /signature/i,
};
/** A label that ends a block of free text, the lines table or the notes. */
const isLabel = (t: string) =>
  [RE.date, RE.validUntil, RE.dueDate, RE.terms, RE.bank, RE.notes, RE.subject, RE.totalDue, RE.total, RE.totalNet, RE.tax, RE.signature].some((r) => r.test(t));

// The lines table's columns, by their header words.
type Col = 'image' | 'code' | 'description' | 'qty' | 'unitPrice' | 'total' | 'tax';
const COLS: [Col, RegExp][] = [
  ['image', /^(image|photo|picture)$/i],
  ['qty', new RegExp(`^(${anyOf(L.map((l) => l.qty))}|qty|qte|quantity|quantité|quantite)\\.?$`, 'i')],
  ['unitPrice', new RegExp(`^(${anyOf(L.map((l) => l.unitPrice))}|price|prix|p\\.?\\s*u\\.?( ht)?|rate|tarif|unit cost)$`, 'i')],
  ['total', new RegExp(`^(${anyOf(L.map((l) => l.lineTotal))}|total|amount|montant( ht)?|total ht)$`, 'i')],
  ['tax', /^(vat|tva|tax)( ?%)?$/i],
  ['code', new RegExp(`^(${anyOf(L.map((l) => l.code))}|code|ref\\.?|réf\\.?|référence|reference|item|article|sku)$`, 'i')],
  ['description', /^(description|désignation|designation|libellé|details|détails)$/i],
];
const colOf = (t: string) => COLS.find(([, r]) => r.test(t.trim()))?.[0];

// --- Values -----------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, janvier: 1, january: 1, feb: 2, fév: 2, févr: 2, février: 2, february: 2, mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, avril: 4, april: 4, may: 5, mai: 5, jun: 6, juin: 6, june: 6, jul: 7, juil: 7, juillet: 7, july: 7,
  aug: 8, août: 8, august: 8, sep: 9, sept: 9, septembre: 9, september: 9, oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11, dec: 12, déc: 12, décembre: 12, december: 12,
};
const iso = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : undefined;

/** "27/09/2026", "27.09.26", "2026-09-27", "27 September 2026", "September 27, 2026" → ISO. Day first when it could be either. */
export function readDate(text: string): string | undefined {
  const t = text.trim().toLowerCase();
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const [a, b] = [+m[1], +m[2]];
    return b > 12 ? iso(y, a, b) : iso(y, b, a);
  }
  m = t.match(/(\d{1,2})(?:er|st|nd|rd|th)?\s+([a-zéû]+)\.?,?\s+(\d{4})/);
  if (m && MONTHS[m[2]]) return iso(+m[3], MONTHS[m[2]], +m[1]);
  m = t.match(/([a-zéû]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m && MONTHS[m[1]]) return iso(+m[3], MONTHS[m[1]], +m[2]);
  return undefined;
}

const AMOUNT = /^[-(]?\s*[€£$]?\s*-?\d[\d\s\u00a0\u202f.,]*\s*(?:[€£$]|eur|gbp|usd)?\s*\)?$/i;
const isAmount = (t: string) => AMOUNT.test(t.trim()) && /\d/.test(t);

/** Spaces between thousands or a decimal comma → French; a thousands comma or decimal point → English. */
function numberStyleOf(amounts: string[]): NumberStyle {
  let fr = 0;
  let en = 0;
  for (const a of amounts) {
    if (/\d[\s\u00a0\u202f]\d{3}\b/.test(a) || /\d,\d{1,2}\b(?![\d,])/.test(a)) fr++;
    if (/\d,\d{3}\b/.test(a) || /\d\.\d{1,2}\b(?![\d.])/.test(a)) en++;
  }
  return fr > en ? 'fr' : 'en';
}

function currencyOf(text: string): CurrencyCode | undefined {
  const hit = text.match(/€|£|\$|\bEUR\b|\bGBP\b|\bUSD\b/);
  if (!hit) return undefined;
  return ({ '€': 'EUR', '£': 'GBP', $: 'USD', EUR: 'EUR', GBP: 'GBP', USD: 'USD' } as const)[hit[0] as '€'];
}

const FR_WORDS = /\b(devis|facture|bon de livraison|objet|désignation|qté|quantité|prix unitaire|total ht|net à payer|échéance|valable|votre contact|conditions de|banque)\b/gi;
const EN_WORDS = /\b(quote|estimate|invoice|delivery note|subject|description|qty|quantity|unit price|total due|due date|valid until|your contact|terms of payment|bank)\b/gi;

// --- The reader -------------------------------------------------------------

export function readBusinessPdf(pages: PdfTextPage[]): ReadDocument {
  const rows = rowsOf(pages);
  const all = rows.map(rowText).join('\n');
  const pageH = (p: number) => pages[p]?.height ?? 842;
  const used = new Set<Row>();
  const out: ReadDocument = {
    subject: '',
    issuer: { name: '', address: [], contact: { name: '', phone: '', email: '' }, bank: [], footer: [] },
    client: { name: '', address: [], reference: '' },
    lines: [],
    notes: '',
    paymentTerms: '',
    language: (all.match(FR_WORDS)?.length ?? 0) > (all.match(EN_WORDS)?.length ?? 0) ? 'fr' : 'en',
    numberStyle: 'en',
  };

  // Every page repeats a header ("Company - Estimate DEV-…") and a footer
  // (the legal lines); find them on page one and set them aside everywhere.
  const first = rows.filter((r) => r.page === 0);
  const isHeader = (r: Row) => r.y < 50 && (r.page === 0 || rows.some((o) => o.page === 0 && o.y < 50 && rowText(o) === rowText(r)));
  const isFooter = (r: Row) => r.y > pageH(r.page) - 70 || /^powered by\b/i.test(rowText(r)) || /^page\s+\d+\s*\/\s*\d+$/i.test(rowText(r));
  const body = rows.filter((r) => !isHeader(r) && !isFooter(r));
  out.issuer.footer = first.filter((r) => isFooter(r) && !/^powered by\b|^page\s+\d/i.test(rowText(r))).map(rowText);

  /** The value beside a label: what follows it in the same segment, else the next segment along. */
  const valueOf = (r: Row, re: RegExp): string | undefined => {
    for (let i = 0; i < r.segs.length; i++) {
      const m = r.segs[i].text.match(re);
      if (!m) continue;
      const own = (m[1] ?? '').replace(/^[\s:]+/, '').trim();
      return own || r.segs.slice(i + 1).map((s) => s.text).join(' ').trim();
    }
    return undefined;
  };
  const findValue = (re: RegExp, last = false): { value: string; row: Row } | undefined => {
    const list = last ? [...body].reverse() : body;
    for (const r of list) {
      const v = valueOf(r, re);
      if (v !== undefined) return { value: v, row: r };
    }
    return undefined;
  };
  /** Rows under a label's value, in the same column, until a gap or another label. */
  const below = (row: Row, x: number): Row[] => {
    const got: Row[] = [];
    let prev = row;
    for (const r of body.filter((b) => b.page === row.page && b.y > row.y)) {
      if (r.y - prev.y > prev.h * 2.2) break;
      // A row with nothing in this column is the other column's ("Total due" beside the notes).
      const seg = r.segs.find((s) => Math.abs(s.x - x) < 6);
      if (!seg) continue;
      if (isLabel(seg.text)) break;
      got.push({ ...r, segs: [seg] });
      prev = r;
    }
    return got;
  };

  // The title: "Estimate DEV-20260927-00411", "Facture FAC-…".
  let titleRow: Row | undefined;
  for (const r of body) {
    const m = r.segs[0].text.match(KIND_RE);
    if (m && kindOf(m[1])) {
      out.kind = kindOf(m[1]);
      out.number = m[2];
      titleRow = r;
      break;
    }
  }
  // Else the running header's: "Company - Invoice INV-…".
  for (const r of rows.filter((x) => x.page === 0 && x.y < 50)) {
    const t = rowText(r);
    const dash = t.lastIndexOf(' - ');
    if (dash < 0) continue;
    const m = t.slice(dash + 3).match(KIND_RE);
    if (m && kindOf(m[1])) {
      out.issuer.name = t.slice(0, dash).trim();
      out.kind ??= kindOf(m[1]);
      out.number ??= m[2];
    }
  }
  if (titleRow) used.add(titleRow);

  const date = findValue(RE.date);
  if (date) {
    out.date = readDate(date.value);
    used.add(date.row);
  }
  const valid = findValue(RE.validUntil);
  if (valid) {
    out.validUntil = readDate(valid.value);
    used.add(valid.row);
  }
  const due = findValue(RE.dueDate);
  if (due) {
    out.dueDate = readDate(due.value);
    used.add(due.row);
  }
  const ref = findValue(RE.clientRef);
  if (ref) {
    out.client.reference = ref.value;
    used.add(ref.row);
  }
  const subject = findValue(RE.subject);
  if (subject) {
    out.subject = subject.value;
    used.add(subject.row);
  }
  // The LAST "Terms of payment": the label/value row at the end, not a sentence in the text above.
  const terms = findValue(RE.terms, true);
  if (terms) {
    out.paymentTerms = terms.value;
    used.add(terms.row);
  }
  const bank = findValue(RE.bank, true);
  if (bank) {
    const valueSeg = bank.row.segs.length > 1 ? bank.row.segs[1] : bank.row.segs[0];
    const more = below(bank.row, valueSeg.x);
    out.issuer.bank = [bank.value, ...more.map(rowText)].filter(Boolean);
    used.add(bank.row);
    for (const r of more) used.add(body.find((b) => b.page === r.page && b.y === r.y)!);
  }

  // The sender, top left: name, address, then "Your contact / Phone / Email".
  const top = titleRow ?? date?.row;
  const contact = body.find((r) => r.page === 0 && RE.contact.test(r.segs[0].text));
  if (contact) {
    out.issuer.contact.name = valueOf(contact, RE.contact) ?? '';
    const x = contact.segs[0].x;
    const left = body.filter((r) => r.page === 0 && r.segs[0].x < x + 6 && Math.abs(r.segs[0].x - x) < 6);
    for (const r of left.filter((r) => r.y > contact.y && r.y < contact.y + contact.h * 4)) {
      const phone = valueOf(r, RE.phone);
      const email = valueOf(r, RE.email);
      if (phone !== undefined) out.issuer.contact.phone = phone;
      if (email !== undefined) out.issuer.contact.email = email;
      if (phone !== undefined || email !== undefined) used.add(r);
    }
    // The address: the rows straight above, back to a gap.
    const above: Row[] = [];
    let prev = contact;
    for (const r of left.filter((r) => r.y < contact.y).reverse()) {
      if (prev.y - r.y > prev.h * 2.2) break;
      above.unshift(r);
      prev = r;
    }
    const addr = above.map((r) => r.segs[0].text);
    if (addr.length && out.issuer.name && addr[0].toLowerCase() === out.issuer.name.toLowerCase()) addr.shift();
    else if (addr.length > 1 && !out.issuer.name) out.issuer.name = addr.shift()!;
    out.issuer.address = addr;
    for (const r of [contact, ...above]) used.add(r);
  }
  if (!out.issuer.name && out.issuer.footer.length) out.issuer.name = out.issuer.footer[0];

  // The client: the block in the title's column, under the date and client no.
  if (top) {
    const x = top.segs.find((s) => KIND_RE.test(s.text) || RE.date.test(s.text))?.x ?? top.segs[0].x;
    const col = body.filter((r) => r.page === 0 && r.y > top.y && r.segs.some((s) => Math.abs(s.x - x) < 6));
    let i = 0;
    let prev = top;
    // Skip the title's own rows (date, client no., valid until…).
    while (i < col.length && col[i].y - prev.y <= prev.h * 2.2) prev = col[i++];
    const block: string[] = [];
    for (; i < col.length; i++) {
      const r = col[i];
      if (block.length && r.y - prev.y > prev.h * 2.2) break;
      const seg = r.segs.find((s) => Math.abs(s.x - x) < 6)!;
      if (isLabel(seg.text) || RE.subject.test(r.segs[0].text)) break;
      block.push(seg.text);
      // A row that is only this column belongs to the client block; one that also has the left column's text is shared.
      if (r.segs.length === 1) used.add(r);
      prev = r;
    }
    out.client.name = block[0] ?? '';
    out.client.address = block.slice(1);
  }

  // The lines table, on every page it is on.
  const amounts: string[] = [];
  let cols: { col: Col; x: number }[] | null = null;
  let tableEnd: Row | null = null;
  interface Part { code: string[]; desc: { text: string; y: number; h: number; w: number }[]; qty?: string; prices: string[]; unit: string[]; total?: string }
  let current: Part | null = null;
  const parts: Part[] = [];
  for (let i = 0; i < body.length; i++) {
    const r = body[i];
    const heads = r.segs.map((s) => colOf(s.text));
    // A header row: three or more column words, a quantity or a total among them.
    if (heads.filter(Boolean).length >= 3 && (heads.includes('qty') || heads.includes('total'))) {
      cols = r.segs.map((s, k) => ({ col: heads[k] ?? 'description', x: s.x })).sort((a, b) => a.x - b.x);
      used.add(r);
      tableEnd = r;
      continue;
    }
    if (!cols || !tableEnd) continue;
    const gap = r.page === tableEnd.page ? r.y - tableEnd.y : 0;
    if (isLabel(r.segs[0].text) || gap > 45) {
      cols = null;
      continue;
    }
    const cells = new Map<Col, Seg[]>();
    for (const s of r.segs) {
      const mid = (s.x + s.x2) / 2;
      let c = cols[0];
      for (const k of cols) if (mid >= k.x - 2) c = k;
      // A long description that starts in its column but ends past the next one's header is still the description.
      const startCol = [...cols].reverse().find((k) => s.x >= k.x - 2) ?? cols[0];
      const pick = startCol.col === 'description' || startCol.col === 'code' ? startCol : c;
      cells.set(pick.col, [...(cells.get(pick.col) ?? []), s]);
    }
    const num = (c: Col) => (cells.get(c) ?? []).map((s) => s.text).filter(isAmount);
    // A quantity and a price start a line — or a quantity alone where nothing is priced (a delivery note).
    const priced = cols.some((k) => k.col === 'unitPrice' || k.col === 'total');
    const startsLine = num('qty').length > 0 && (!priced || num('unitPrice').length > 0 || num('total').length > 0);
    if (startsLine) {
      current = { code: [], desc: [], prices: [], unit: [] };
      parts.push(current);
      current.qty = num('qty')[0];
      current.total = num('total')[0];
    }
    if (!current) continue;
    used.add(r);
    tableEnd = r;
    for (const s of cells.get('code') ?? []) current.code.push(s.text);
    for (const s of cells.get('description') ?? []) current.desc.push({ text: s.text, y: s.y, h: s.h, w: s.x2 - s.x });
    for (const s of cells.get('unitPrice') ?? []) (isAmount(s.text) ? current.prices : current.unit).push(s.text);
    for (const s of cells.get('total') ?? []) if (!isAmount(s.text) || !startsLine) current.unit.push(s.text);
    amounts.push(...num('unitPrice'), ...num('total'));
  }

  // Totals and VAT.
  let statedTotal: string | undefined;
  let statedIsDue = false;
  for (const r of body) {
    const t = r.segs[0].text;
    const value = r.segs.slice(1).map((s) => s.text).find(isAmount);
    if (value) amounts.push(value);
    const tax = t.match(RE.tax);
    if (tax && value) out.taxRate = parseDecimal(tax[1]) ?? undefined;
    // "Total due" / "Net à payer" over a plain "Total".
    if (value && RE.totalDue.test(t)) [statedTotal, statedIsDue] = [value, true];
    else if (value && RE.total.test(t) && !statedIsDue) statedTotal = value;
    if (RE.total.test(t) || RE.totalDue.test(t) || RE.totalNet.test(t) || tax) used.add(r);
  }
  out.numberStyle = numberStyleOf(amounts);
  out.currency = currencyOf(amounts.join(' ')) ?? currencyOf(all);
  const money = (t: string | undefined) => (t === undefined ? undefined : parseMoney(t.replace(/eur|gbp|usd|[()]/gi, ''), out.numberStyle) ?? undefined);
  out.statedTotal = money(statedTotal);

  // The column width a description wraps at: from its header to the next one.
  const descWidth = (() => {
    const header = body.find((r) => r.segs.filter((s) => colOf(s.text)).length >= 3);
    if (!header) return 0;
    const xs = header.segs.map((s) => s.x).sort((a, b) => a - b);
    const d = header.segs.find((s) => colOf(s.text) === 'description');
    const next = d && xs.find((x) => x > d.x + 1);
    return d && next ? next - d.x : 0;
  })();
  for (const p of parts) {
    let description = '';
    p.desc.forEach((d, k) => {
      if (k === 0) description = d.text;
      else {
        const prev = p.desc[k - 1];
        // A blank line's worth of space is a paragraph; a full line ending is the PDF wrapping it.
        const sep = d.y - prev.y > prev.h * 1.9 ? '\n\n' : descWidth && prev.w > descWidth * 0.8 ? ' ' : '\n';
        description += sep + d.text;
      }
    });
    const prices = p.prices.map((x) => money(x)).filter((x): x is number => x !== undefined);
    const quantity = (p.qty && parseDecimal(p.qty)) || 1;
    const total = money(p.total);
    // Two prices in the column: the struck-through list price above the real one.
    let unitPrice = prices.length > 1 ? prices[prices.length - 1] : prices[0];
    const listPrice = prices.length > 1 && prices[0] > prices[prices.length - 1] ? prices[0] : undefined;
    if (unitPrice === undefined && total !== undefined) unitPrice = Math.round(total / quantity);
    out.lines.push({ code: p.code.join(' '), description, quantity, unit: p.unit.join(' '), unitPrice: unitPrice ?? 0, ...(listPrice ? { listPrice } : {}) });
  }

  // Notes: the "Notes:" box, and any free text between the subject and the table.
  const notes: string[] = [];
  if (subject) {
    const free: string[] = [];
    let prev = subject.row;
    for (const r of body.filter((b) => b.page === subject.row.page && b.y > subject.row.y)) {
      // Everything down to the lines table — "Payment terms: …" in a sentence here is text, not the label.
      if (used.has(r)) break;
      if (free.length && r.y - prev.y > prev.h * 1.9) free.push('');
      free.push(rowText(r));
      used.add(r);
      prev = r;
    }
    if (free.length) notes.push(free.join('\n'));
  }
  const noteRow = body.find((r) => RE.notes.test(r.segs[0].text));
  if (noteRow) {
    // Only what follows "Notes:" in its own segment: the totals often share its row.
    const own = (noteRow.segs[0].text.match(RE.notes)?.[1] ?? '').trim();
    const more = below(noteRow, noteRow.segs[0].x);
    const text = [own, ...more.map((r) => r.segs[0].text)].filter(Boolean).join('\n');
    if (text) notes.push(text);
  }
  out.notes = notes.join('\n\n');
  return out;
}
