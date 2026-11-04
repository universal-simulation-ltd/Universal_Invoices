// Which companies a catalogue item is sold by (James, 2026-11-04: "We need a
// catalogue to be linked to one or multiple companies so other company
// products aren't shared via the link").
//
// `Product.companyIds` lists them. None — every item from before this, and
// any whose companies have all been deleted — means ALL your companies: it is
// offered on every company's documents, but a company's link never sends it.
// A link sends only what is ticked for that company.

import type { Company, Product } from './types';

/** Its companies that still exist. */
export function companiesOf(p: Pick<Product, 'companyIds'>, companies: Pick<Company, 'id'>[]): string[] {
  const known = new Set(companies.map((c) => c.id));
  return (p.companyIds ?? []).filter((id) => known.has(id));
}

/** Offered on this company's documents: ticked for it, or for all companies. */
export function soldBy(p: Pick<Product, 'companyIds'>, companyId: string | undefined, companies: Pick<Company, 'id'>[]): boolean {
  const ids = companiesOf(p, companies);
  return ids.length === 0 || !companyId || ids.includes(companyId);
}

/** Sent by this company's link: ticked for it, by name — never an all-companies item. */
export const linkedTo = (p: Pick<Product, 'companyIds'>, companyId: string) => !!p.companyIds?.includes(companyId);

/** The ids to store: none ticked = all companies, so the field goes. */
export function withCompanies<T extends Pick<Product, 'companyIds'>>(p: T, ids: string[]): T {
  const next: T = { ...p, companyIds: [...new Set(ids)] };
  if (!next.companyIds?.length) delete next.companyIds;
  return next;
}
