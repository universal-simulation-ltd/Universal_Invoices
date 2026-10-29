// The built-in example: a made-up company, one client, a small catalogue and
// one quote, so somebody arriving from the portal can see a finished PDF in
// one tap. Every name, number and address here is invented.

import { blankLine, lineFromProduct, newDocument, uid } from './convert';
import { defaultNumbering, todayIso } from './numbering';
import type { Client, Company, InvoiceDoc, Product } from './types';

export function exampleData(today = todayIso()): { company: Company; client: Client; products: Product[]; doc: InvoiceDoc } {
  const now = Date.now();
  const company: Company = {
    id: uid(),
    name: 'Example Studio Ltd',
    address: ['1 Example Street', 'Bristol BS1 1AA', 'United Kingdom'],
    contact: { name: 'Alex Example', phone: '+44 117 000 0000', email: 'alex@example.com' },
    bank: ['Example Bank plc', 'Sort code: 00-00-00', 'Account: 00000000'],
    footer: ['Example Studio Ltd', 'Registered in England and Wales No. 00000000 - VAT GB000000000', '1 Example Street, Bristol BS1 1AA'],
    defaults: {
      language: 'en',
      numberStyle: 'en',
      currency: 'GBP',
      taxMode: 'standard',
      taxNote: '',
      taxRate: 20,
      paymentTerms: '30 days from the invoice date',
      notes: '',
      validityDays: 30,
      dueDays: 30,
    },
    numbering: defaultNumbering('en'),
    updatedAt: now,
  };
  const client: Client = {
    id: uid(),
    name: 'Sample Customer GmbH',
    address: ['Musterstraße 1', '10115 Berlin', 'Germany'],
    reference: 'C-001',
    email: 'buyer@example.org',
    updatedAt: now,
  };
  const products: Product[] = [
    { id: uid(), code: 'WS-DAY', description: 'Workshop, one day on site', unit: 'day', unitPrice: 95000, taxRate: 20, updatedAt: now },
    { id: uid(), code: 'LIC-12', description: 'Software licence, 12 months', unit: 'seat', unitPrice: 24000, listPrice: 30000, taxRate: 20, updatedAt: now },
    { id: uid(), code: 'TRAVEL', description: 'Travel and accommodation', unit: 'trip', unitPrice: 45000, taxRate: 20, updatedAt: now },
  ];
  const created = newDocument('quote', company, today, client);
  const doc: InvoiceDoc = {
    ...created.doc,
    subject: 'Training programme, spring term',
    lines: [
      { ...lineFromProduct(products[0]), quantity: 2 },
      { ...lineFromProduct(products[1]), quantity: 10 },
      lineFromProduct(products[2]),
      { ...blankLine(20), description: 'Course materials, printed and bound', quantity: 12, unit: 'set', unitPrice: 1850 },
    ],
  };
  return { company: created.company, client, products, doc };
}
