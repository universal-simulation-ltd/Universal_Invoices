// A link to a company (James, 2026-11-04: "share a company via a link so
// someone opens (might need a code gate) and they can create documents for
// that company. Documents made locally not synced").
//
// The owner, signed in, keeps the company — and, if they tick them, the
// catalogue and clients — in the platform's `app_shares` (the same table a
// document's link uses), ENCRYPTED IN THE BROWSER: the server holds bytes it
// cannot read. The key is never sent to it:
//
//   link   …/invoices/?company=<row id>#k=<secret>
//   key    PBKDF2-SHA256(code, salt = secret) → AES-GCM-256
//
// The part after # stays in the browser (it is not sent with the request), so
// the link alone opens it. With a code (the suite's XXXX-XXXX format) the
// link alone is not enough: the code is sent another way, and guessing it
// against a leaked link means 30^8 slow PBKDF2 tries.
//
// Whoever opens it adds a copy to their own companies. The copy follows the
// owner's edits (name, address, contact, banks, footer, logo) while the link
// lasts; their documents stay with them — nothing goes back to the owner.
//
// Pure (WebCrypto + fflate), so the tests run it in Node.

import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { LiveField } from './fromOrg';
import { linkedTo } from './soldBy';
import type { Client, Company, Folder, Product } from './types';

export const COMPANY_SHARE_MIME = 'application/vnd.unisim.invoices-company+json';
export const companyRef = (companyId: string) => `company:${companyId}`;
const PAYLOAD_VERSION = 1;
const ITERATIONS = 310_000;

/** What the owner chose to send with the company. */
export interface CompanyShareLink {
  /** The `app_shares` row id — the ?company= in the link. */
  id: string;
  /** base64url, 16 random bytes — the #k= in the link. */
  secret: string;
  /** XXXX-XXXX, when the link asks for one. */
  code?: string;
  catalogue: boolean;
  clients: boolean;
}

/** On the copy someone added from a link. */
export interface SharedFrom {
  /** The link's row id. */
  id: string;
  /** The AES key, base64url — kept so the copy can follow the owner's edits without asking for the code again. */
  key: string;
  /** The row's `updated_at` this copy was last brought up to. */
  updatedAt: string;
  /** The owner stopped sharing: the copy stays as it was, and is yours to edit. */
  ended?: boolean;
}

export interface CompanySharePayload {
  app: 'universal-invoices';
  kind: 'company';
  version: number;
  company: Company;
  products: Product[];
  folders: Folder[];
  clients: Client[];
}

/** The fields of a received company that follow the owner's — the rest (defaults, numbering) is the recipient's. */
export const SHARED_FIELDS: ReadonlySet<LiveField> = new Set<LiveField>(['name', 'address', 'phone', 'email', 'bank', 'footer', 'logo']);

// ---- codes: the suite standard (Docs ARCHITECTURE.md → Company codes) ----

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export function makeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = '';
  // 256 % 30 = 16: rejecting the top 16 values keeps every character equally likely.
  for (const b of bytes) {
    let v = b;
    while (v >= 240) v = crypto.getRandomValues(new Uint8Array(1))[0];
    out += ALPHABET[v % 30];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Any case, with or without spaces or the dash → XXXXXXXX. */
export const normCode = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, '');

// ---- bytes ----

export function toB64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** fflate's bytes, typed as WebCrypto wants them (they are never shared memory). */
const bytes = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>;

export const makeSecret = () => toB64url(crypto.getRandomValues(new Uint8Array(16)));

/** The AES key the link and code make, as base64url. */
export async function deriveKey(secret: string, code = ''): Promise<string> {
  const base = await crypto.subtle.importKey('raw', bytes(strToU8(normCode(code))), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64url(secret), iterations: ITERATIONS }, base, 256);
  return toB64url(new Uint8Array(bits));
}

const aesKey = (key: string) => crypto.subtle.importKey('raw', fromB64url(key), 'AES-GCM', false, ['encrypt', 'decrypt']);

// ---- the envelope: what the row's `data` holds ----

interface Envelope {
  v: 1;
  /** Whether opening it asks for a code — the only thing the server can read. */
  code: boolean;
  iv: string;
  data: string;
}

export async function seal(payload: CompanySharePayload, key: string, withCode: boolean): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = gzipSync(strToU8(JSON.stringify(payload)), { level: 6 });
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(key), bytes(plain)));
  const env: Envelope = { v: 1, code: withCode, iv: toB64url(iv), data: toB64url(sealed) };
  return JSON.stringify(env);
}

function readEnvelope(text: string): Envelope {
  const env = JSON.parse(text) as Partial<Envelope>;
  if (env?.v !== 1 || typeof env.iv !== 'string' || typeof env.data !== 'string') throw new Error('This link is not a Universal Invoices company.');
  return env as Envelope;
}

export const needsCode = (text: string) => readEnvelope(text).code;

export class WrongKey extends Error {}

/** Throws WrongKey when the code (or the link) does not match. */
export async function unseal(text: string, key: string): Promise<CompanySharePayload> {
  const env = readEnvelope(text);
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(env.iv) }, await aesKey(key), fromB64url(env.data)));
  } catch {
    throw new WrongKey('That code does not match this link.');
  }
  const p = JSON.parse(strFromU8(gunzipSync(plain))) as Partial<CompanySharePayload>;
  if (p.app !== 'universal-invoices' || p.kind !== 'company' || !p.company) throw new Error('This link is not a Universal Invoices company.');
  if (typeof p.version !== 'number' || p.version > PAYLOAD_VERSION) {
    throw new Error('This company was shared from a newer version of Universal Invoices. Reload the page to update.');
  }
  return { app: 'universal-invoices', kind: 'company', version: p.version, company: p.company, products: p.products ?? [], folders: p.folders ?? [], clients: p.clients ?? [] };
}

// ---- what goes in, and what comes out ----

/** The company as it is sent: none of the owner's own links, hub ties or examples. */
function sendable(company: Company): Company {
  const out = { ...company };
  delete out.shareLink;
  delete out.sharedFrom;
  delete out.orgId;
  delete out.orgLogoUrl;
  delete out.example;
  return out;
}

export function buildPayload(company: Company, data: { products: Product[]; folders: Folder[]; clients: Client[] }, opts: { catalogue: boolean; clients: boolean }): CompanySharePayload {
  // The catalogue items ticked for THIS company — never another company's, and
  // never an all-companies one (lib/soldBy.ts). Sent without their company
  // ticks: those are the owner's ids, meaningless at the other end.
  const products = opts.catalogue
    ? data.products
        .filter((p) => !p.example && linkedTo(p, company.id))
        .map((p) => {
          const out = { ...p };
          delete out.companyIds;
          return out;
        })
    : [];
  return {
    app: 'universal-invoices',
    kind: 'company',
    version: PAYLOAD_VERSION,
    company: sendable(company),
    products,
    // Only the folders those products sit in: another company's folder names stay here too.
    folders: data.folders.filter((f) => products.some((p) => p.folderId === f.id)),
    clients: opts.clients ? data.clients.filter((c) => !c.example) : [],
  };
}

/** A fingerprint of what would be sent, so an unchanged company is not uploaded again. */
export async function payloadStamp(payload: CompanySharePayload): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes(strToU8(JSON.stringify(payload))));
  return toB64url(new Uint8Array(digest));
}

/** Initials for the recipient's numbers: letters and digits, up to 4, upper case. */
export const normInitials = (text: string) => text.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 4);

/**
 * The recipient's copy, made the first time. A new id (the owner's own copy
 * may be in the same browser under another account); the owner's defaults to
 * start from; numbering from 1 with the recipient's initials on the end, so
 * their numbers never match the owner's — nobody counts both sets.
 */
export function receivedCompany(payload: CompanySharePayload, link: Omit<SharedFrom, 'ended'>, initials: string, makeId: () => string, now = Date.now()): Company {
  const c = payload.company;
  const tag = normInitials(initials);
  const numbering = Object.fromEntries(
    Object.entries(c.numbering).map(([kind, n]) => [kind, { pattern: tag ? `${n.pattern}-${tag}` : n.pattern, next: 1 }]),
  ) as Company['numbering'];
  return { ...structuredClone(c), id: makeId(), numbering, sharedFrom: { ...link }, updatedAt: now };
}

/** The copy brought up to the owner's latest: only the fields that follow them. */
export function followShared(mine: Company, payload: CompanySharePayload, updatedAt: string, now = Date.now()): Company {
  const c = payload.company;
  return {
    ...mine,
    name: c.name,
    logo: c.logo,
    address: [...c.address],
    contact: { ...mine.contact, phone: c.contact.phone, email: c.contact.email },
    bank: [...c.bank],
    moreBanks: c.moreBanks ? structuredClone(c.moreBanks) : undefined,
    footer: [...c.footer],
    sharedFrom: { ...mine.sharedFrom!, updatedAt },
    updatedAt: now,
  };
}

/**
 * The owner's catalogue items as they land here: sold by the copy they came
 * with — or, for one already here, by whichever companies it was ticked for.
 */
export const forCopy = (products: Product[], copyId: string, mine: Product[] = []): Product[] => {
  const have = new Map(mine.map((p) => [p.id, p]));
  return products.map((p) => ({ ...p, companyIds: have.get(p.id)?.companyIds ?? [copyId] }));
};

/** Whether following would change anything (so an unchanged link writes nothing). */
export function sharedDiffers(mine: Company, payload: CompanySharePayload): boolean {
  const c = payload.company;
  const pick = (x: Company) => JSON.stringify([x.name, x.logo?.dataUrl, x.address, x.contact.phone, x.contact.email, x.bank, x.moreBanks ?? [], x.footer]);
  return pick(mine) !== pick(c);
}

/**
 * The owner's catalogue / clients rows to write here: new ones, and newer
 * versions of ones already here — but never one deleted here (`deleted`), so
 * a product the recipient threw away does not keep coming back.
 */
export function incomingRows<T extends { id: string; updatedAt: number }>(mine: T[], theirs: T[], deleted: Set<string>): T[] {
  const have = new Map(mine.map((r) => [r.id, r]));
  return theirs.filter((r) => !deleted.has(r.id) && (!have.has(r.id) || (r.updatedAt ?? 0) > (have.get(r.id)!.updatedAt ?? 0)));
}

export const companyShareUrl = (origin: string, base: string, link: Pick<CompanyShareLink, 'id' | 'secret'>) =>
  `${origin}${base}?company=${encodeURIComponent(link.id)}#k=${link.secret}`;

/** The #k= of the current page, if any. */
export const secretFromHash = (hash: string) => new URLSearchParams(hash.replace(/^#/, '')).get('k');
