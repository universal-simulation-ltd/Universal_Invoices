// A signed-in company's details (the hub's My Company → Business details,
// platform 0318) → a Company in this app. Pure, so it is tested in Node; the
// logo is fetched separately, because that needs the network and a canvas.

import { defaultNumbering } from './numbering';
import type { Company } from './types';

/** The part of the SDK's `Organisation` this reads — all optional until 0318 is applied. */
export interface OrgDetails {
  id: string;
  name: string;
  logo_url?: string | null;
  legal_name?: string | null;
  address_lines?: string[] | null;
  vat_number?: string | null;
  registration_number?: string | null;
  phone?: string | null;
  public_email?: string | null;
  website?: string | null;
  bank_details?: string[] | null;
}

const tidy = (xs: string[] | null | undefined) => (xs ?? []).map((x) => x.trim()).filter(Boolean);

/** Whether the hub has anything beyond the name to bring in. */
export function hasBusinessDetails(org: OrgDetails): boolean {
  return !!(
    org.legal_name?.trim() ||
    tidy(org.address_lines).length ||
    org.vat_number?.trim() ||
    org.registration_number?.trim() ||
    tidy(org.bank_details).length
  );
}

/**
 * The footer every page carries: the registered name in bold, then the
 * address on one line, then the numbers, then how to reach you — the same
 * order as the Sellsy footer it replaces.
 */
export function footerFor(org: OrgDetails): string[] {
  const name = org.legal_name?.trim() || org.name;
  const address = tidy(org.address_lines).join(' - ');
  const numbers = [org.registration_number?.trim(), org.vat_number?.trim() && `VAT ${org.vat_number.trim()}`].filter(Boolean).join(' - ');
  const reach = [org.phone?.trim() && `Tel ${org.phone.trim()}`, org.public_email?.trim(), org.website?.trim()].filter(Boolean).join(' - ');
  return [name, address, numbers, reach].filter(Boolean) as string[];
}

/**
 * Fold the hub's details into `existing` (the Company already linked to this
 * org, if there is one) or start a new one. Only what the hub KNOWS is taken:
 * a field the hub leaves blank keeps what was typed here, and the app's own
 * settings — numbering, defaults, the contact person — are never touched.
 */
export function companyFromOrg(org: OrgDetails, existing: Company | undefined, contactName: string, makeId: () => string): Company {
  const base: Company = existing ?? {
    id: makeId(),
    name: org.name,
    address: [],
    contact: { name: contactName, phone: '', email: '' },
    bank: [],
    footer: [],
    defaults: {
      language: 'en',
      numberStyle: 'en',
      currency: 'EUR',
      taxMode: 'export-exempt',
      taxNote: 'Exonération de TVA, art. 262 I du CGI',
      taxRate: 20,
      paymentTerms: '',
      notes: '',
      validityDays: 180,
      dueDays: 30,
    },
    numbering: defaultNumbering('en'),
    updatedAt: Date.now(),
  };
  const address = tidy(org.address_lines);
  const bank = tidy(org.bank_details);
  return {
    ...base,
    orgId: org.id,
    name: org.legal_name?.trim() || org.name || base.name,
    address: address.length ? address : base.address,
    contact: {
      name: base.contact.name || contactName,
      phone: org.phone?.trim() || base.contact.phone,
      email: org.public_email?.trim() || base.contact.email,
    },
    bank: bank.length ? bank : base.bank,
    footer: hasBusinessDetails(org) ? footerFor(org) : base.footer,
    updatedAt: Date.now(),
  };
}

/** The fields of a Company the hub can own. */
export type LiveField = 'name' | 'address' | 'phone' | 'email' | 'bank' | 'footer' | 'logo';

/**
 * Which fields follow the hub — the ones it has a value for. A field the hub
 * leaves blank stays yours to type here (James, 2026-10-30: keep the company
 * in sync, "highlight the box to show it's dynamic").
 */
export function liveFields(org: OrgDetails): Set<LiveField> {
  const out = new Set<LiveField>(['name']);
  if (tidy(org.address_lines).length) out.add('address');
  if (org.phone?.trim()) out.add('phone');
  if (org.public_email?.trim()) out.add('email');
  if (tidy(org.bank_details).length) out.add('bank');
  if (hasBusinessDetails(org)) out.add('footer');
  if (org.logo_url) out.add('logo');
  return out;
}

/** Whether syncing `next` over `stored` would change anything the hub owns (the logo is compared by URL, elsewhere). */
export function hubFieldsDiffer(next: Company, stored: Company): boolean {
  const pick = (c: Company) => JSON.stringify([c.name, c.address, c.contact.phone, c.contact.email, c.bank, c.footer]);
  return pick(next) !== pick(stored);
}
