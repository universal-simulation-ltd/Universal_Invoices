// French e-invoicing (James, 2026-11-10: "we produce documents, we're not an
// accounting platform, does it apply to us? If so, we can just have an option
// to disable invoices if the user needs to"). The duty is on French
// VAT-registered businesses invoicing each other — issuing through an approved
// platform (plateforme agréée): larger firms from 1 September 2026, small
// ones and sole traders from 1 September 2027 — not on software that draws a
// PDF. So the app tells them, once, when an invoice goes from a business in
// France to one in France, and lets anyone who invoices elsewhere hide
// invoices (Tune this app). Quotes, estimates, proformas and delivery notes
// are not invoices and are untouched.

import type { InvoiceDoc } from './types';

/**
 * Whether address (and footer) lines place a party in France. There is no
 * country field, so: a line that IS "France" (the usual last line of a French
 * address) or ends ", France", or a French VAT number (FR + 2 characters +
 * the 9-digit SIREN). "1 Avenue de France" is a street, not a country.
 */
export function inFrance(lines: string[]): boolean {
  return lines.some((raw) => {
    const line = raw.trim();
    return /^(france|fr)$/i.test(line) || /[,–-]\s*france$/i.test(line) || /\bFR\s?[0-9A-HJ-NP-Z]{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/.test(line);
  });
}

/** An invoice from a business in France to a client in France: the case the reform covers. */
export function frenchEInvoicing(doc: Pick<InvoiceDoc, 'kind' | 'issuer' | 'client'>): boolean {
  return doc.kind === 'invoice' && inFrance([...doc.issuer.address, ...doc.issuer.footer]) && inFrance(doc.client.address);
}
