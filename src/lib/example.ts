// The built-in example: ONE of each kind — a made-up company, a client, a
// catalogue item and a quote — so somebody arriving from the portal can see a
// finished PDF in one tap. Every row carries `example: true`: the lists show it
// with an Example chip and a dashed border, and making a real one of the same
// kind deletes it (James, 2026-10-30). Every name, number and address is invented.

import { blankLine, lineFromProduct, newDocument, uid } from './convert';
import { defaultNumbering, todayIso } from './numbering';
import type { Client, Company, InvoiceDoc, Product } from './types';

export function exampleData(today = todayIso()): { company: Company; client: Client; product: Product; doc: InvoiceDoc } {
  const now = Date.now();
  const company: Company = {
    id: uid(),
    example: true,
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
    example: true,
    name: 'Sample Customer GmbH',
    address: ['Musterstraße 1', '10115 Berlin', 'Germany'],
    reference: 'C-001',
    email: 'buyer@example.org',
    updatedAt: now,
  };
  // A list price above the price, so the example shows the struck-through discount.
  const product: Product = {
    id: uid(),
    example: true,
    code: 'LIC-12',
    description: 'Software licence, 12 months',
    unit: 'seat',
    unitPrice: 24000,
    listPrice: 30000,
    taxRate: 20,
    updatedAt: now,
  };
  const created = newDocument('quote', company, today, client);
  const doc: InvoiceDoc = {
    ...created.doc,
    example: true,
    subject: 'Training programme, spring term',
    lines: [
      { ...lineFromProduct(product), quantity: 10 },
      { ...blankLine(20), code: 'WS-DAY', description: 'Workshop, one day on site', quantity: 2, unit: 'day', unitPrice: 95000 },
      { ...blankLine(20), description: 'Course materials, printed and bound', quantity: 12, unit: 'set', unitPrice: 1850 },
    ],
  };
  return { company: created.company, client, product, doc };
}
