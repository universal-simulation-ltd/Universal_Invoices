import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { computeTotals } from '@unisim/doc';
import { clientSnapshot, companyForImport, convertDocument, importedDocument, newDocument, withCataloguePictures } from './convert';
import { exampleData } from './example';
import { groupByJourney, journeyOf, nextStep, relinkAfterDelete, sourceFor, startOf, stepsOf } from './journey';
import { changedBy, upgrade } from './legacy';
import { counterAfter } from './numbering';
import { renderPdf } from './pdf';
import { textPages } from './pdfText';
import { readBusinessPdf, readDate } from './readPdf';
import type { InvoiceDoc } from './types';
import { printedUnit } from './units';

// Every PDF here is one this app made from the invented example, read back:
// no real document is ever committed (the repo is public).
async function readBack(doc: InvoiceDoc) {
  const bytes = new Uint8Array(await renderPdf(doc).blob.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes, verbosity: 0, isEvalSupported: false }).promise;
  return readBusinessPdf(await textPages(pdf));
}

describe('import PDF', () => {
  const { company, client, product, doc } = exampleData('2026-10-29');

  it('reads back a quote this app printed', async () => {
    // Units ticked on, so they print and can be read back (off by default since 2026-11-11).
    const read = await readBack({ ...doc, showUnits: true, client: clientSnapshot(client), notes: 'Thanks for your business.\nSecond line' });
    expect(read).toMatchObject({
      kind: 'quote',
      number: doc.number,
      date: '2026-10-29',
      validUntil: doc.validUntil,
      subject: 'Training programme, spring term',
      client: {
        name: 'Sample Customer GmbH',
        address: ['Musterstraße 1', '10115 Berlin', 'Germany'],
        reference: 'C-001',
        contact: { name: 'Sam Sample', role: 'Buyer', email: 'buyer@example.org' },
      },
      issuer: { name: 'Example Studio Ltd', address: ['1 Example Street', 'Bristol BS1 1AA', 'United Kingdom'], contact: { name: 'Alex Example' } },
      notes: 'Thanks for your business.\nSecond line',
      paymentTerms: doc.paymentTerms,
      currency: 'GBP',
      numberStyle: 'en',
      taxRate: 20,
      statedTotal: computeTotals(doc).gross,
    });
    // The unit as printed: one or many by the quantity (lib/units.ts).
    expect(read.lines.map(({ code, quantity, unit, unitPrice, discount }) => ({ code, quantity, unit, unitPrice, discount }))).toEqual(
      doc.lines.map(({ code, quantity, unit, unitPrice, discount }) => ({ code, quantity, unit: printedUnit(unit, quantity, 'en') ?? '', unitPrice, discount })),
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

  it('reads a whole-document discount and an amount off a line', async () => {
    const read = await readBack({ ...doc, discount: { percent: 5 }, lines: [{ ...doc.lines[1], discount: { amount: 15000 } }] });
    expect(read.discount).toEqual({ percent: 5 });
    expect(read.lines[0]).toMatchObject({ unitPrice: 95000, discount: { amount: 15000 } });
    expect(read.statedTotal).toBe(computeTotals({ ...doc, discount: { percent: 5 }, lines: [{ ...doc.lines[1], discount: { amount: 15000 } }] }).gross);
  });

  it('gives imported lines the picture of the catalogue item with their code', () => {
    const picture = { dataUrl: 'data:image/jpeg;base64,', width: 1, height: 1 };
    const lines = [
      { id: 'a', code: 'lic-12 ', description: '', quantity: 1, unit: '', unitPrice: 0 },
      { id: 'b', code: 'NOPE', description: '', quantity: 1, unit: '', unitPrice: 0 },
    ];
    const [hit, miss] = withCataloguePictures(lines, [{ ...product, code: 'LIC-12', image: picture }]);
    expect(hit).toMatchObject({ image: picture, productId: product.id });
    expect(miss.image).toBeUndefined();
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

  it('groups a list by journey, where its newest row is', () => {
    const lone = { ...newDocument('invoice', company, '2026-10-15').doc, createdAt: 4 };
    // Newest first, as Documents lists them; the quote is filtered out.
    const groups = groupByJourney([inv, lone, est], [...docs, lone]);
    expect(groups.map((g) => g.map((d) => d.id))).toEqual([[est.id, inv.id], [lone.id]]);
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

describe('list prices become discounts', () => {
  const { product, doc } = exampleData('2026-10-29');
  it('keeps every total to the cent', () => {
    const old = { ...doc, lines: [{ ...doc.lines[1], unitPrice: 24000, listPrice: 30000 }, { ...doc.lines[2], listPrice: 100 }] } as unknown as InvoiceDoc;
    const { documents, products } = upgrade({ documents: [old], products: [{ ...product, listPrice: 99 } as typeof product] });
    expect(documents![0].lines[0]).toMatchObject({ unitPrice: 30000, discount: { amount: 6000 } });
    expect('listPrice' in documents![0].lines[0]).toBe(false);
    expect(documents![0].lines[1].discount).toBeUndefined();
    expect(computeTotals(documents![0]).lines[0]).toBe(Math.round(doc.lines[1].quantity * 24000));
    expect('listPrice' in products![0]).toBe(false);
    expect(changedBy([doc], upgrade({ documents: [doc] }).documents!)).toEqual([]);
  });
});
