import { describe, expect, it } from 'vitest';
import { frenchEInvoicing, inFrance } from './france';

const party = (address: string[], footer: string[] = []) => ({ name: 'X', address, footer, contact: { name: '', phone: '', email: '' }, bank: [] });

describe('French e-invoicing', () => {
  it('knows a French address by its last line, or a French VAT number', () => {
    expect(inFrance(['12 rue de la Paix', '75002 Paris', 'France'])).toBe(true);
    expect(inFrance(['12 rue de la Paix', '75002 Paris, France'])).toBe(true);
    expect(inFrance(['SAS Exemple — TVA FR 12 345 678 901'])).toBe(true);
    expect(inFrance(['TVA intracommunautaire : FR12345678901'])).toBe(true);
  });

  it('is not fooled by other countries or a street called France', () => {
    expect(inFrance(['Musterstraße 1', '10115 Berlin', 'Germany'])).toBe(false);
    expect(inFrance(['1 Avenue de France', 'Brussels', 'Belgium'])).toBe(false);
    expect(inFrance(['VAT GB000000000'])).toBe(false);
  });

  it('applies to an invoice between two businesses in France — and nothing else', () => {
    const fr = party(['75002 Paris', 'France']);
    const de = party(['10115 Berlin', 'Germany']);
    const doc = (kind: 'invoice' | 'quote' | 'proforma', issuer = fr, client = fr) => ({ kind, issuer, client: { name: 'C', address: client.address, reference: '' } });
    expect(frenchEInvoicing(doc('invoice'))).toBe(true);
    expect(frenchEInvoicing(doc('quote'))).toBe(false);
    expect(frenchEInvoicing(doc('proforma'))).toBe(false);
    expect(frenchEInvoicing(doc('invoice', fr, de))).toBe(false);
    expect(frenchEInvoicing(doc('invoice', de, fr))).toBe(false);
    // The seller's French VAT number in the footer places them too.
    expect(frenchEInvoicing(doc('invoice', party(['Paris'], ['TVA FR12345678901'])))).toBe(true);
  });
});
