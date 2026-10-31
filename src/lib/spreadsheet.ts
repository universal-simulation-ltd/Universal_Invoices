// Your data as a spreadsheet, and back (James, 2026-10-30: "a way to export
// individual (e.g. a single company) and all data into spreadsheet to be
// imported to a different account").
//
// One sheet per kind of record — Companies, Clients, Catalogue, Documents —
// plus Lines (a document's lines, one row each) and a Read me first. Headers
// are words, values are what you would type: prices in euros not cents,
// "Quote" not "quote", dates as 2026-10-30. Columns are found by their
// header, so reordering them in Excel is fine.
//
// Importing ADDS a row with no ID or an ID this browser has not seen, and
// UPDATES a row whose ID it has when something in it differs — the sheet
// wins, because a person editing a cell is the point. It never deletes.
//
// Not in the sheet: pictures (logos, catalogue and line images). A cell holds
// at most 32 767 characters and a logo is more. An update keeps the pictures
// already here; the JSON backup is still the complete copy.
//
// Pure, so the tests run it in Node.

import { arrange, flatten } from './arrange';
import { uid } from './convert';
import { defaultNumbering } from './numbering';
import type { Dataset } from './backup';
import {
  KIND_NAMES,
  KIND_ORDER,
  STATUS_NAMES,
  type BusinessDocKind,
  type Client,
  type Company,
  type CurrencyCode,
  type DocLine,
  type DocStatus,
  type Folder,
  type InvoiceDoc,
  type Product,
  type TaxMode,
} from './types';
import { readXlsx, writeXlsx, type Cell, type Sheet } from './xlsx';

// ── Values ───────────────────────────────────────────────────────────────────

const TAX_NAMES: Record<TaxMode, string> = {
  'export-exempt': 'No VAT — export',
  'reverse-charge': 'No VAT — reverse charge',
  standard: 'VAT on each line',
};
const LANGUAGE_NAMES = { en: 'English', fr: 'French' } as const;
const CURRENCY_SIGNS: Record<CurrencyCode, string> = { EUR: '€', GBP: '£', USD: '$' };

const lines = (xs: string[]) => xs.join('\n');
const money = (minor: number | undefined) => (minor === undefined ? null : minor / 100);
const yesNo = (b: boolean | undefined) => (b === undefined ? null : b ? 'Yes' : 'No');

const str = (v: Cell) => (v === null || v === undefined ? '' : String(v)).trim();
const toLines = (v: Cell) =>
  str(v)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/** A number as typed in any of the usual ways: 1234.5, "1 234,50", "€1,234.50". */
export function toNumber(v: Cell): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  let s = str(v).replace(/[\s\u00a0\u202f€£$%]/g, '');
  if (!s) return undefined;
  // Both separators: the last one is the decimal point. A comma alone is a
  // decimal comma, unless it groups thousands (1,234 or 1,234,567).
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
const toMinor = (v: Cell) => {
  const n = toNumber(v);
  return n === undefined ? undefined : Math.round(n * 100);
};

/** A date as text, or a date Excel turned into a serial number when someone retyped it. */
export function toIsoDate(v: Cell): string | undefined {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = str(v);
  if (!s) return undefined;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return undefined;
}

/** A value from a short list, matched on its name or its code, any case. */
function oneOf<K extends string>(v: Cell, names: Record<K, string>, fallback: K): K {
  const s = str(v).toLowerCase();
  if (!s) return fallback;
  for (const [code, name] of Object.entries(names) as [K, string][]) {
    if (s === code.toLowerCase() || s === name.toLowerCase()) return code;
  }
  return fallback;
}
const toYesNo = (v: Cell): boolean | undefined => {
  if (typeof v === 'boolean') return v;
  const s = str(v).toLowerCase();
  if (['yes', 'y', 'true', 'oui', '1'].includes(s)) return true;
  if (['no', 'n', 'false', 'non', '0'].includes(s)) return false;
  return undefined;
};

// ── Columns ──────────────────────────────────────────────────────────────────

interface Column<T> {
  header: string;
  width: number;
  get: (row: T) => Cell;
}

const COMPANY_COLUMNS: Column<Company>[] = [
  { header: 'ID', width: 14, get: (c) => c.id },
  { header: 'Name', width: 28, get: (c) => c.name },
  { header: 'Address', width: 30, get: (c) => lines(c.address) },
  { header: 'Contact name', width: 18, get: (c) => c.contact.name },
  { header: 'Phone', width: 16, get: (c) => c.contact.phone },
  { header: 'Email', width: 24, get: (c) => c.contact.email },
  { header: 'Bank details', width: 30, get: (c) => lines(c.bank) },
  { header: 'Legal footer', width: 40, get: (c) => lines(c.footer) },
  { header: 'Language', width: 10, get: (c) => LANGUAGE_NAMES[c.defaults.language] },
  { header: 'Numbers look like', width: 12, get: (c) => LANGUAGE_NAMES[c.defaults.numberStyle] },
  { header: 'Currency', width: 9, get: (c) => c.defaults.currency },
  { header: 'Tax', width: 22, get: (c) => TAX_NAMES[c.defaults.taxMode] },
  { header: 'VAT rate %', width: 9, get: (c) => c.defaults.taxRate },
  { header: 'Exemption wording', width: 30, get: (c) => c.defaults.taxNote },
  { header: 'Payment terms', width: 20, get: (c) => c.defaults.paymentTerms },
  { header: 'Notes', width: 24, get: (c) => c.defaults.notes },
  { header: 'Quotes valid for (days)', width: 10, get: (c) => c.defaults.validityDays },
  { header: 'Invoices due after (days)', width: 10, get: (c) => c.defaults.dueDays },
  ...KIND_ORDER.flatMap((k): Column<Company>[] => [
    { header: `${KIND_NAMES[k]} numbers`, width: 22, get: (c) => c.numbering[k].pattern },
    { header: `Next ${KIND_NAMES[k].toLowerCase()}`, width: 8, get: (c) => c.numbering[k].next },
  ]),
];

const CLIENT_COLUMNS: Column<Client>[] = [
  { header: 'ID', width: 14, get: (c) => c.id },
  { header: 'Name', width: 28, get: (c) => c.name },
  { header: 'Address', width: 30, get: (c) => lines(c.address) },
  { header: 'Reference', width: 14, get: (c) => c.reference },
  { header: 'Email', width: 24, get: (c) => c.email },
];

/** `folder` is the name of the folder it sits in (the catalogue's arrangement). */
const PRODUCT_COLUMNS: Column<Product & { folder: string }>[] = [
  { header: 'ID', width: 14, get: (p) => p.id },
  { header: 'Folder', width: 16, get: (p) => p.folder || null },
  { header: 'Code', width: 14, get: (p) => p.code },
  { header: 'Description', width: 40, get: (p) => p.description },
  { header: 'Unit', width: 8, get: (p) => p.unit },
  { header: 'Unit price', width: 12, get: (p) => money(p.unitPrice) },
  { header: 'List price', width: 12, get: (p) => money(p.listPrice) },
  { header: 'VAT rate %', width: 9, get: (p) => p.taxRate ?? null },
];

const DOCUMENT_COLUMNS: Column<InvoiceDoc>[] = [
  { header: 'ID', width: 14, get: (d) => d.id },
  { header: 'Kind', width: 12, get: (d) => KIND_NAMES[d.kind] },
  { header: 'Number', width: 20, get: (d) => d.number },
  { header: 'Status', width: 10, get: (d) => STATUS_NAMES[d.status] },
  { header: 'Date', width: 11, get: (d) => d.date },
  { header: 'Valid until', width: 11, get: (d) => d.validUntil ?? null },
  { header: 'Due', width: 11, get: (d) => d.dueDate ?? null },
  { header: 'Company ID', width: 14, get: (d) => d.companyId },
  { header: 'Client ID', width: 14, get: (d) => d.clientId ?? null },
  { header: 'Client name', width: 24, get: (d) => d.client.name },
  { header: 'Client address', width: 30, get: (d) => lines(d.client.address) },
  { header: 'Client reference', width: 14, get: (d) => d.client.reference },
  { header: 'Subject', width: 30, get: (d) => d.subject },
  { header: 'Language', width: 10, get: (d) => LANGUAGE_NAMES[d.language] },
  { header: 'Numbers look like', width: 12, get: (d) => LANGUAGE_NAMES[d.numberStyle] },
  { header: 'Currency', width: 9, get: (d) => d.currency },
  { header: 'Tax', width: 22, get: (d) => TAX_NAMES[d.taxMode] },
  { header: 'Exemption wording', width: 30, get: (d) => d.taxNote },
  { header: 'Payment terms', width: 20, get: (d) => d.paymentTerms },
  { header: 'Notes', width: 24, get: (d) => d.notes },
  { header: 'Signature box', width: 9, get: (d) => yesNo(d.signature) },
  { header: 'Made from (ID)', width: 14, get: (d) => d.sourceId ?? null },
  // The issuer as printed — a snapshot, so a document does not change when
  // its company does (types.ts).
  { header: 'From: name', width: 24, get: (d) => d.issuer.name },
  { header: 'From: address', width: 30, get: (d) => lines(d.issuer.address) },
  { header: 'From: contact name', width: 18, get: (d) => d.issuer.contact.name },
  { header: 'From: phone', width: 16, get: (d) => d.issuer.contact.phone },
  { header: 'From: email', width: 24, get: (d) => d.issuer.contact.email },
  { header: 'From: bank details', width: 30, get: (d) => lines(d.issuer.bank) },
  { header: 'From: legal footer', width: 40, get: (d) => lines(d.issuer.footer) },
];

interface LineRow {
  doc: InvoiceDoc;
  line: DocLine;
}
const LINE_COLUMNS: Column<LineRow>[] = [
  { header: 'Document ID', width: 14, get: (r) => r.doc.id },
  { header: 'Document number', width: 20, get: (r) => r.doc.number },
  { header: 'Line ID', width: 14, get: (r) => r.line.id },
  { header: 'Catalogue ID', width: 14, get: (r) => r.line.productId ?? null },
  { header: 'Code', width: 14, get: (r) => r.line.code },
  { header: 'Description', width: 40, get: (r) => r.line.description },
  { header: 'Quantity', width: 9, get: (r) => r.line.quantity },
  { header: 'Unit', width: 8, get: (r) => r.line.unit },
  { header: 'Unit price', width: 12, get: (r) => money(r.line.unitPrice) },
  { header: 'List price', width: 12, get: (r) => money(r.line.listPrice) },
  { header: 'VAT rate %', width: 9, get: (r) => r.line.taxRate ?? null },
];

const SHEETS = { companies: 'Companies', clients: 'Clients', products: 'Catalogue', documents: 'Documents', lines: 'Lines' } as const;

const README: Cell[][] = [
  ['Universal Invoices — your data as a spreadsheet'],
  ['One row per company, client, catalogue item and document; a document’s lines are on the Lines sheet, one row each.'],
  ['To import: Universal Invoices → menu → Advanced → Import… and choose this file. It adds and updates; it never deletes.'],
  ['Keep a row’s ID and the import updates that row. Leave ID empty to add a new one.'],
  ['Prices are in the currency’s units (1234.50, not cents). Dates are written 2026-10-30.'],
  ['Columns are found by their header, so you can reorder them — but keep the header names.'],
  ['On the Catalogue sheet, Folder is the folder an item sits in: type a new name to make that folder, or clear it to take the item out.'],
  ['Pictures (logos, catalogue images) are not in a spreadsheet. Use Advanced → Export a backup for a complete copy.'],
];

function table<T>(name: string, columns: Column<T>[], rows: T[]): Sheet {
  return {
    name,
    widths: columns.map((c) => c.width),
    rows: [columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => c.get(r)))],
  };
}

/** The workbook for these rows. Examples are left out — they are the app's, not yours. */
export function toWorkbook(data: Dataset): Sheet[] {
  const real = <T extends { example?: boolean }>(xs: T[]) => xs.filter((x) => !x.example);
  const documents = real(data.documents);
  // In the catalogue's own order, folder by folder.
  const folderName = new Map(data.folders.map((f) => [f.id, f.name]));
  const products = flatten(arrange(real(data.products), data.folders)).map((p) => ({ ...p, folder: (p.folderId && folderName.get(p.folderId)) || '' }));
  return [
    { name: 'Read me', rows: README, widths: [110] },
    table(SHEETS.companies, COMPANY_COLUMNS, real(data.companies)),
    table(SHEETS.clients, CLIENT_COLUMNS, real(data.clients)),
    table(SHEETS.products, PRODUCT_COLUMNS, products),
    table(SHEETS.documents, DOCUMENT_COLUMNS, documents),
    table(SHEETS.lines, LINE_COLUMNS, documents.flatMap((doc) => doc.lines.map((line) => ({ doc, line })))),
  ];
}

export function exportXlsx(data: Dataset): Uint8Array {
  return writeXlsx(toWorkbook(data));
}

/**
 * What goes with a selection, so it imports whole somewhere else: a company
 * brings its documents; a document brings its company, its client and the
 * catalogue items its lines came from. Clients and catalogue items go alone.
 */
export function selectionFor(data: Dataset, table: keyof Dataset, ids: string[]): Dataset {
  const want = new Set(ids);
  let documents: InvoiceDoc[] = [];
  let companies: Company[] = [];
  let clients: Client[] = [];
  let products: Product[] = [];
  if (table === 'companies') {
    companies = data.companies.filter((c) => want.has(c.id));
    documents = data.documents.filter((d) => want.has(d.companyId));
  } else if (table === 'documents') {
    documents = data.documents.filter((d) => want.has(d.id));
  } else if (table === 'clients') {
    clients = data.clients.filter((c) => want.has(c.id));
  } else {
    products = data.products.filter((p) => want.has(p.id));
  }
  if (documents.length) {
    const companyIds = new Set([...companies.map((c) => c.id), ...documents.map((d) => d.companyId)]);
    const clientIds = new Set([...clients.map((c) => c.id), ...documents.flatMap((d) => (d.clientId ? [d.clientId] : []))]);
    const productIds = new Set([...products.map((p) => p.id), ...documents.flatMap((d) => d.lines.flatMap((l) => (l.productId ? [l.productId] : [])))]);
    companies = data.companies.filter((c) => companyIds.has(c.id));
    clients = data.clients.filter((c) => clientIds.has(c.id));
    products = data.products.filter((p) => productIds.has(p.id));
  }
  // The folders those catalogue items sit in, so they import into the same ones.
  const folderIds = new Set(products.flatMap((p) => (p.folderId ? [p.folderId] : [])));
  const folders = data.folders.filter((f) => folderIds.has(f.id));
  return { companies, clients, products, folders, documents };
}

// ── Importing ────────────────────────────────────────────────────────────────

type Row = (header: string) => Cell;

/** The data rows of a sheet as header → value lookups. Blank rows skipped. */
function rowsOf(sheets: Sheet[], name: string): Row[] {
  const sheet = sheets.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
  if (!sheet || !sheet.rows.length) return [];
  const headers = (sheet.rows[0] ?? []).map((h) => str(h).toLowerCase());
  return sheet.rows
    .slice(1)
    .filter((r) => r.some((v) => str(v) !== ''))
    .map((r) => (header: string) => {
      const i = headers.indexOf(header.toLowerCase());
      return i < 0 ? undefined : r[i];
    });
}

/** Whether a sheet has this column at all — an empty cell reads the same as a missing column. */
function hasColumn(sheets: Sheet[], name: string, header: string): boolean {
  const sheet = sheets.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
  return !!sheet?.rows[0]?.some((h) => str(h).toLowerCase() === header.toLowerCase());
}

const optional = (v: string) => v || undefined;

export interface ImportPlan {
  /** Rows to write: new ones, and existing ones the sheet changes. */
  write: Dataset;
  added: number;
  updated: number;
  /** Things the import worked around, in words. */
  notes: string[];
}

/** Compare two rows ignoring key order and the timestamps. */
function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k, x]) => x !== undefined && k !== 'updatedAt' && k !== 'createdAt')
          .sort(([x], [y]) => x.localeCompare(y))
          .map(([k, x]) => [k, norm(x)]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

export function planImport(current: Dataset, bytes: Uint8Array, now = Date.now(), makeId: () => string = uid): ImportPlan {
  const sheets = readXlsx(bytes);
  const known = [SHEETS.companies, SHEETS.clients, SHEETS.products, SHEETS.documents].map((n) => n.toLowerCase());
  if (!sheets.some((s) => known.includes(s.name.trim().toLowerCase()))) {
    throw new Error('That spreadsheet has none of the Companies, Clients, Catalogue or Documents sheets. Export one from Universal Invoices to see the layout.');
  }
  const notes: string[] = [];
  let added = 0;
  let updated = 0;
  const write: Dataset = { companies: [], clients: [], products: [], folders: [], documents: [] };

  /** Add, update or skip one row; returns the row as it now stands. */
  function settle<T extends { id: string; updatedAt: number }>(table: keyof Dataset, existing: T | undefined, next: T): T {
    if (!existing) {
      added++;
      (write[table] as unknown as T[]).push(next);
      return next;
    }
    if (same(existing, next)) return existing;
    updated++;
    (write[table] as unknown as T[]).push(next);
    return next;
  }
  const idOf = (r: Row) => str(r('ID'));

  // Companies first: documents need them.
  const companies = new Map(current.companies.map((c) => [c.id, c]));
  for (const r of rowsOf(sheets, SHEETS.companies)) {
    const id = idOf(r) || makeId();
    const old = companies.get(id);
    const name = str(r('Name'));
    if (!name && !old) continue;
    const lang = oneOf(r('Language'), LANGUAGE_NAMES, old?.defaults.language ?? 'en');
    const numbering = old?.numbering ?? defaultNumbering(lang);
    const next: Company = {
      ...old,
      id,
      example: undefined,
      name: name || old!.name,
      address: toLines(r('Address')),
      contact: { name: str(r('Contact name')), phone: str(r('Phone')), email: str(r('Email')) },
      bank: toLines(r('Bank details')),
      footer: toLines(r('Legal footer')),
      defaults: {
        language: lang,
        numberStyle: oneOf(r('Numbers look like'), LANGUAGE_NAMES, old?.defaults.numberStyle ?? lang),
        currency: oneOf(r('Currency'), CURRENCY_SIGNS, old?.defaults.currency ?? 'EUR'),
        taxMode: oneOf(r('Tax'), TAX_NAMES, old?.defaults.taxMode ?? 'export-exempt'),
        taxRate: toNumber(r('VAT rate %')) ?? old?.defaults.taxRate ?? 20,
        taxNote: str(r('Exemption wording')),
        paymentTerms: str(r('Payment terms')),
        notes: str(r('Notes')),
        validityDays: Math.max(0, Math.round(toNumber(r('Quotes valid for (days)')) ?? old?.defaults.validityDays ?? 180)),
        dueDays: Math.max(0, Math.round(toNumber(r('Invoices due after (days)')) ?? old?.defaults.dueDays ?? 30)),
      },
      numbering: Object.fromEntries(
        KIND_ORDER.map((k) => [
          k,
          {
            pattern: str(r(`${KIND_NAMES[k]} numbers`)) || numbering[k].pattern,
            next: Math.max(1, Math.round(toNumber(r(`Next ${KIND_NAMES[k].toLowerCase()}`)) ?? numbering[k].next)),
          },
        ]),
      ) as Company['numbering'],
      updatedAt: now,
    };
    if (!next.example) delete next.example;
    companies.set(id, settle('companies', old, next));
  }

  const clients = new Map(current.clients.map((c) => [c.id, c]));
  for (const r of rowsOf(sheets, SHEETS.clients)) {
    const id = idOf(r) || makeId();
    const old = clients.get(id);
    const name = str(r('Name'));
    if (!name && !old) continue;
    const next: Client = { ...old, id, name: name || old!.name, address: toLines(r('Address')), reference: str(r('Reference')), email: str(r('Email')), updatedAt: now };
    delete next.example;
    clients.set(id, settle('clients', old, next));
  }

  // A folder is found by its name (any case); a name not here yet makes one.
  const folders = new Map(current.folders.map((f) => [f.name.trim().toLowerCase(), f]));
  const folderFor = (name: string): Folder => {
    const have = folders.get(name.toLowerCase());
    if (have) return have;
    const made: Folder = { id: makeId(), name, updatedAt: now };
    folders.set(name.toLowerCase(), settle('folders', undefined, made));
    return made;
  };

  const products = new Map(current.products.map((p) => [p.id, p]));
  const folderColumn = hasColumn(sheets, SHEETS.products, 'Folder');
  for (const r of rowsOf(sheets, SHEETS.products)) {
    const id = idOf(r) || makeId();
    const old = products.get(id);
    const description = str(r('Description'));
    if (!description && !str(r('Code')) && !old) continue;
    // No Folder column (an older sheet) leaves an item where it is.
    const folderName = folderColumn ? str(r('Folder')) : undefined;
    const folderId = folderName === undefined ? old?.folderId : folderName ? folderFor(folderName).id : undefined;
    const next: Product = {
      ...old,
      id,
      code: str(r('Code')),
      description,
      unit: str(r('Unit')),
      unitPrice: toMinor(r('Unit price')) ?? 0,
      listPrice: toMinor(r('List price')),
      taxRate: toNumber(r('VAT rate %')),
      folderId,
      updatedAt: now,
    };
    delete next.example;
    if (next.listPrice === undefined) delete next.listPrice;
    if (next.taxRate === undefined) delete next.taxRate;
    if (next.folderId === undefined) delete next.folderId;
    products.set(id, settle('products', old, next));
  }

  // Lines, grouped by document ID — or number, for a document typed in with no ID.
  const linesByKey = new Map<string, Row[]>();
  for (const r of rowsOf(sheets, SHEETS.lines)) {
    const key = str(r('Document ID')) || `#${str(r('Document number'))}`;
    if (key === '#') continue;
    linesByKey.set(key, [...(linesByKey.get(key) ?? []), r]);
  }

  const documents = new Map(current.documents.map((d) => [d.id, d]));
  const docRows = rowsOf(sheets, SHEETS.documents);
  for (const r of docRows) {
    const givenId = idOf(r);
    const id = givenId || makeId();
    const old = documents.get(id);
    const number = str(r('Number'));
    if (!number && !old) continue;

    // Its company: the one it names, else the first of yours, else one made
    // from the "From" columns, so the document is never orphaned.
    let company = companies.get(str(r('Company ID')));
    if (!company) {
      company = [...companies.values()].find((c) => !c.example);
      if (!company) {
        const made: Company = {
          id: str(r('Company ID')) || makeId(),
          name: str(r('From: name')) || 'Your company',
          address: toLines(r('From: address')),
          contact: { name: str(r('From: contact name')), phone: str(r('From: phone')), email: str(r('From: email')) },
          bank: toLines(r('From: bank details')),
          footer: toLines(r('From: legal footer')),
          defaults: {
            language: oneOf(r('Language'), LANGUAGE_NAMES, 'en'),
            numberStyle: oneOf(r('Numbers look like'), LANGUAGE_NAMES, 'en'),
            currency: oneOf(r('Currency'), CURRENCY_SIGNS, 'EUR'),
            taxMode: oneOf(r('Tax'), TAX_NAMES, 'export-exempt'),
            taxNote: str(r('Exemption wording')),
            taxRate: 20,
            paymentTerms: str(r('Payment terms')),
            notes: '',
            validityDays: 180,
            dueDays: 30,
          },
          numbering: defaultNumbering(oneOf(r('Language'), LANGUAGE_NAMES, 'en')),
          updatedAt: now,
        };
        company = settle('companies', undefined, made);
        companies.set(made.id, company);
        notes.push(`${made.name} was added from a document’s “From” details, because the spreadsheet had no company for it.`);
      } else if (str(r('Company ID'))) {
        notes.push(`${number || 'A document'} named a company that is not here; it now comes from ${company.name}.`);
      }
    }

    const lineRows = linesByKey.get(givenId) ?? linesByKey.get(`#${number}`) ?? [];
    const oldLines = new Map((old?.lines ?? []).map((l) => [l.id, l]));
    const docLines: DocLine[] = lineRows.length || !old
      ? lineRows.map((lr) => {
          const lineId = str(lr('Line ID')) || makeId();
          const was = oldLines.get(lineId);
          const productId = optional(str(lr('Catalogue ID')));
          const line: DocLine = {
            id: lineId,
            productId,
            // Pictures are not in the sheet: keep the one here, or the catalogue item's.
            image: was?.image ?? (productId ? products.get(productId)?.image : undefined),
            code: str(lr('Code')),
            description: str(lr('Description')),
            quantity: toNumber(lr('Quantity')) ?? 1,
            unit: str(lr('Unit')),
            unitPrice: toMinor(lr('Unit price')) ?? 0,
            listPrice: toMinor(lr('List price')),
            taxRate: toNumber(lr('VAT rate %')),
          };
          for (const k of ['productId', 'image', 'listPrice', 'taxRate'] as const) if (line[k] === undefined) delete line[k];
          return line;
        })
      : old.lines;

    const clientId = optional(str(r('Client ID')));
    const next: InvoiceDoc = {
      ...old,
      id,
      kind: oneOf<BusinessDocKind>(r('Kind'), KIND_NAMES, old?.kind ?? 'quote'),
      status: oneOf<DocStatus>(r('Status'), STATUS_NAMES, old?.status ?? 'draft'),
      companyId: company.id,
      issuer: {
        name: str(r('From: name')) || company.name,
        // A document keeps the logo it was made with; a new one takes its company's.
        logo: old ? old.issuer.logo : company.logo,
        address: r('From: address') !== undefined ? toLines(r('From: address')) : company.address,
        contact: {
          name: str(r('From: contact name')),
          phone: str(r('From: phone')),
          email: str(r('From: email')),
        },
        bank: r('From: bank details') !== undefined ? toLines(r('From: bank details')) : company.bank,
        footer: r('From: legal footer') !== undefined ? toLines(r('From: legal footer')) : company.footer,
        ...(old?.issuer.orgId ? { orgId: old.issuer.orgId } : {}),
      },
      clientId: clientId && clients.has(clientId) ? clientId : undefined,
      client: { name: str(r('Client name')), address: toLines(r('Client address')), reference: str(r('Client reference')) },
      number: number || old!.number,
      date: toIsoDate(r('Date')) ?? old?.date ?? new Date(now).toISOString().slice(0, 10),
      validUntil: toIsoDate(r('Valid until')),
      dueDate: toIsoDate(r('Due')),
      subject: str(r('Subject')),
      language: oneOf(r('Language'), LANGUAGE_NAMES, old?.language ?? company.defaults.language),
      numberStyle: oneOf(r('Numbers look like'), LANGUAGE_NAMES, old?.numberStyle ?? company.defaults.numberStyle),
      currency: oneOf(r('Currency'), CURRENCY_SIGNS, old?.currency ?? company.defaults.currency),
      taxMode: oneOf(r('Tax'), TAX_NAMES, old?.taxMode ?? company.defaults.taxMode),
      taxNote: str(r('Exemption wording')),
      lines: docLines,
      notes: str(r('Notes')),
      paymentTerms: str(r('Payment terms')),
      signature: toYesNo(r('Signature box')),
      sourceId: optional(str(r('Made from (ID)'))),
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
    };
    delete next.example;
    for (const k of ['clientId', 'validUntil', 'dueDate', 'signature', 'sourceId'] as const) if (next[k] === undefined) delete next[k];
    if (next.issuer.logo === undefined) delete next.issuer.logo;
    documents.set(id, settle('documents', old, next));
  }
  if (!docRows.length && linesByKey.size) notes.push('The Lines sheet was skipped: lines only come in with their document on the Documents sheet.');

  return { write, added, updated, notes };
}
