import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { computeTotals } from '@unisim/doc';
import { companyForImport, convertDocument, importedDocument, newDocument } from './convert';
import { exampleData } from './example';
import { journeyOf, nextStep, relinkAfterDelete, sourceFor, startOf, stepsOf } from './journey';
import { counterAfter } from './numbering';
import { renderPdf } from './pdf';
import { textPages } from './pdfText';
import { readBusinessPdf, readDate } from './readPdf';
import type { InvoiceDoc } from './types';

// Every PDF here is one this app made from the invented example, read back:
// no real document is ever committed (the repo is public).
async function readBack(doc: InvoiceDoc) {
  const bytes = new Uint8Array(await renderPdf(doc).blob.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes, verbosity: 0, isEvalSupported: false }).promise;
  return readBusinessPdf(await textPages(pdf));
}

describe('import PDF', () => {
  const { company, doc } = exampleData('2026-10-29');

  it('reads back a quote this app printed', async () => {
    const read = await readBack({ ...doc, notes: 'Thanks for your business.\nSecond line' });
    expect(read).toMatchObject({
      kind: 'quote',
      number: doc.number,
      date: '2026-10-29',
      validUntil: doc.validUntil,
      subject: 'Training programme, spring term',
      client: { name: 'Sample Customer GmbH', address: ['Musterstraße 1', '10115 Berlin', 'Germany'], reference: 'C-001' },
      issuer: { name: 'Example Studio Ltd', address: ['1 Example Street', 'Bristol BS1 1AA', 'United Kingdom'], contact: { name: 'Alex Example' } },
      notes: 'Thanks for your business.\nSecond line',
      paymentTerms: doc.paymentTerms,
      currency: 'GBP',
      numberStyle: 'en',
      taxRate: 20,
      statedTotal: computeTotals(doc).gross,
    });
    expect(read.lines.map(({ code, quantity, unit, unitPrice, listPrice }) => ({ code, quantity, unit, unitPrice, listPrice }))).toEqual(
      doc.lines.map(({ code, quantity, unit, unitPrice, listPrice }) => ({ code, quantity, unit, unitPrice, listPrice })),
    );
  });

  it('reads French numbers, a wrapped description and a delivery note with no prices', async () => {
    const long = 'Haptic and VR dental training simulator, supplied with its stand, cables, software and a printed manual in English';
    const fr = await readBack({ ...doc, kind: 'estimate', numberStyle: 'fr', currency: 'EUR', lines: [{ ...doc.lines[1], description: `Simulator\n\n${long}`, unitPrice: 3750000 }] });
    expect(fr.kind).toBe('estimate');
    expect(fr.numberStyle).toBe('fr');
    expect(fr.lines[0]).toMatchObject({ unitPrice: 3750000, description: `Simulator\n\n${long}` });
    const dn = await readBack({ ...doc, kind: 'delivery-note' });
    expect(dn.lines.map((l) => l.quantity)).toEqual([10, 2, 12]);
  });

  it('becomes a document that keeps its number and moves the counter past it', async () => {
    const read = await readBack({ ...doc, kind: 'invoice', number: 'INV-20261029-00411', dueDate: '2026-11-28' });
    const file = { name: 'x.pdf', type: 'application/pdf', size: 1, dataUrl: 'data:application/pdf;base64,' };
    const mine = [{ ...company, example: false }];
    const from = companyForImport(read, mine)!;
    const r = importedDocument(read, from, file, 'quote', '2026-11-03');
    expect(r.doc).toMatchObject({ kind: 'invoice', number: 'INV-20261029-00411', dueDate: '2026-11-28', imported: { checked: false } });
    expect(computeTotals(r.doc).gross).toBe(read.statedTotal);
    expect(r.company.numbering.invoice.next).toBe(412);
  });

  it('reads the date shapes people print', () => {
    expect(readDate('27/09/2026')).toBe('2026-09-27');
    expect(readDate('09/27/2026')).toBe('2026-09-27');
    expect(readDate('2026-09-27')).toBe('2026-09-27');
    expect(readDate('27 septembre 2026')).toBe('2026-09-27');
    expect(readDate('September 27, 2026')).toBe('2026-09-27');
    expect(readDate('soon')).toBeUndefined();
  });

  it('only moves a counter for a number that fits its pattern', () => {
    const n = { pattern: 'DEV-{YYYY}{MM}{DD}-{N:5}', next: 7 };
    expect(counterAfter(n, 'DEV-20260927-00411').next).toBe(412);
    expect(counterAfter(n, 'DEV-20260927-00003').next).toBe(7);
    expect(counterAfter(n, 'Q-411')).toBe(n);
  });
});

describe('journey', () => {
  const { company, doc: quote } = exampleData('2026-10-29');
  const est = { ...newDocument('estimate', company, '2026-10-01').doc, createdAt: 1 };
  const q = { ...quote, sourceId: est.id, createdAt: 2 };
  const inv = { ...convertDocument(q, 'invoice', company, '2026-10-30').doc, createdAt: 3 };
  const docs = [est, q, inv];

  it('walks the documents made from each other, from the first', () => {
    const j = journeyOf(inv, docs);
    expect(j.root.id).toBe(est.id);
    expect(j.members.map((d) => d.kind)).toEqual(['estimate', 'quote', 'invoice']);
    const steps = stepsOf(j);
    expect(steps.map((s) => s.state)).toEqual(['made', 'made', 'todo', 'made', 'todo']);
    expect(nextStep(steps, 'quote')).toBe('proforma');
    expect(sourceFor(steps, 'delivery-note', inv).id).toBe(inv.id);
  });

  it('shows marks, and starts where the journey starts', () => {
    const lone = { ...quote, journey: { 'delivery-note': { state: 'done' as const, at: 1 }, proforma: { state: 'skipped' as const, at: 1 } } };
    const steps = stepsOf(journeyOf(lone, [lone]));
    expect(steps.map((s) => s.state)).toEqual(['todo', 'made', 'skipped', 'todo', 'done']);
    expect(startOf(steps)).toBe(1);
  });

  it('stays whole when a document in it is deleted', () => {
    const marked = { ...est, journey: { proforma: { state: 'skipped' as const, at: 1 } } };
    const middle = relinkAfterDelete([marked, q, inv], [q.id]);
    expect(middle).toEqual([expect.objectContaining({ id: inv.id, sourceId: est.id })]);
    const first = relinkAfterDelete([marked, q, inv], [est.id]);
    expect(first).toEqual([expect.objectContaining({ id: q.id, journey: marked.journey })]);
    expect(first[0].sourceId).toBeUndefined();
  });
});
