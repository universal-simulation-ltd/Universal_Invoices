import { describe, expect, it } from 'vitest';
import { computeTotals } from '@unisim/doc';
import { customsCopy, looksLikeDelivery } from './customs';
import { duplicateDocument, lineFromProduct, pdfFingerprint, printedDescription, toBusinessDoc } from './convert';
import { exampleData } from './example';
import { journeyOf } from './journey';
import type { DocLine, InvoiceDoc } from './types';

let n = 0;
const line = (unitPrice: number, quantity = 1, extra: Partial<DocLine> = {}): DocLine => ({
  id: `l${++n}`,
  code: '',
  description: 'Simulator',
  quantity,
  unit: 'unit',
  unitPrice,
  ...extra,
});

const proforma = (lines: DocLine[], patch: Partial<InvoiceDoc> = {}): InvoiceDoc => ({
  ...exampleData('2026-11-11').doc,
  example: undefined,
  kind: 'proforma',
  currency: 'EUR',
  taxMode: 'export-exempt',
  discount: undefined,
  lines,
  ...patch,
});

const gross = (doc: InvoiceDoc, lines = doc.lines, discount = doc.discount) => computeTotals({ ...doc, lines, discount }).gross;

describe('customsCopy', () => {
  it('builds line and document discounts into the prices, total unchanged', () => {
    const doc = proforma(
      [line(1_000_000, 3, { discount: { percent: 10 } }), line(250_000, 2, { discount: { amount: 12_345 } }), line(99_999, 7)],
      { discount: { percent: 5 } },
    );
    const r = customsCopy(doc, { foldDiscounts: true, deliveryIds: [], delivery: 'keep' });
    expect(r.discount).toBeUndefined();
    expect(r.lines.every((l) => !l.discount)).toBe(true);
    expect(r.total).toBe(gross(doc));
    expect(r.lines.map((l) => l.quantity)).toEqual([3, 2, 7]);
  });

  it('builds them in with VAT on the lines too', () => {
    const doc = proforma([line(123_456, 3, { taxRate: 20, discount: { percent: 7 } }), line(45_678, 5, { taxRate: 5.5 })], {
      taxMode: 'standard',
      discount: { amount: 10_000 },
    });
    const r = customsCopy(doc, { foldDiscounts: true, deliveryIds: [], delivery: 'keep' });
    expect(r.total).toBe(gross(doc));
  });

  it('shows per-product delivery as one line with its total', () => {
    const a = line(500_000, 2);
    const da = line(15_000, 2, { description: 'Delivery — simulator' });
    const b = line(300_000, 1);
    const db = line(9_000, 1, { description: 'Shipping, monitor' });
    const doc = proforma([a, da, b, db]);
    const r = customsCopy(doc, { foldDiscounts: false, deliveryIds: [da.id, db.id], delivery: 'single' });
    expect(r.lines.map((l) => l.description)).toEqual(['Simulator', 'Delivery', 'Simulator']);
    expect(r.lines[1]).toMatchObject({ quantity: 1, unitPrice: 39_000, unit: '' });
    expect(r.total).toBe(gross(doc));
  });

  it('builds delivery into the other prices so it is not shown', () => {
    const a = line(333_333, 3, { discount: { percent: 10 } });
    const b = line(77_777, 1, { discount: { amount: 1_000 } });
    const d = line(45_000, 1, { description: 'Freight' });
    const doc = proforma([a, b, d], { discount: { percent: 2 } });
    const r = customsCopy(doc, { foldDiscounts: false, deliveryIds: [d.id], delivery: 'spread' });
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0].discount).toEqual({ percent: 10 });
    expect(r.total).toBe(gross(doc));
  });

  it('both at once: delivery in the prices and no discounts', () => {
    const a = line(1_000_000, 4, { discount: { percent: 15 } });
    const d = line(20_000, 4, { description: 'Livraison' });
    const doc = proforma([a, d], { discount: { amount: 50_000 } });
    const r = customsCopy(doc, { foldDiscounts: true, deliveryIds: [d.id], delivery: 'spread' });
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].discount).toBeUndefined();
    expect(r.discount).toBeUndefined();
    expect(r.total).toBe(gross(doc));
  });

  it('leaving delivery off lowers the total by its amount', () => {
    const a = line(100_000, 1);
    const d = line(5_000, 1, { description: 'Delivery' });
    const doc = proforma([a, d]);
    const r = customsCopy(doc, { foldDiscounts: false, deliveryIds: [d.id], delivery: 'drop' });
    expect(r.lines).toEqual([a]);
    expect(r.total).toBe(100_000);
  });

  it('ticks delivery lines by their wording, in English or French', () => {
    expect(looksLikeDelivery({ code: 'SHIP', description: 'Delivery to Lyon' })).toBe(true);
    expect(looksLikeDelivery({ code: '', description: 'Frais de port' })).toBe(true);
    expect(looksLikeDelivery({ code: '', description: 'Fret maritime' })).toBe(true);
    expect(looksLikeDelivery({ code: 'SIM-1', description: 'Dental simulator' })).toBe(false);
    expect(looksLikeDelivery({ code: '', description: 'Portable unit' })).toBe(false);
  });
});

describe('units and origin on the PDF', () => {
  it('prints no unit unless the document asks for them', () => {
    const doc = proforma([line(1000, 3, { unit: 'day' })]);
    expect(toBusinessDoc(doc).lines[0].unit).toBeUndefined();
    expect(toBusinessDoc({ ...doc, showUnits: true }).lines[0].unit).toBe('days');
  });

  it('prints the country of origin under the description when shown', () => {
    const l = line(1000, 1, { description: 'Dental simulator', origin: 'France' });
    expect(printedDescription(l, { showOrigin: false, language: 'en' })).toBe('Dental simulator');
    expect(printedDescription(l, { showOrigin: true, language: 'en' })).toBe('Dental simulator\nOrigin: France');
    expect(printedDescription(l, { showOrigin: true, language: 'fr' })).toBe('Dental simulator\nOrigine : France');
    expect(printedDescription({ ...l, origin: ' ' }, { showOrigin: true, language: 'en' })).toBe('Dental simulator');
  });

  it('a catalogue item brings its origin onto the line', () => {
    const l = lineFromProduct({ id: 'p1', code: 'X', description: 'Thing', unit: '', unitPrice: 1, origin: 'China' });
    expect(l.origin).toBe('China');
  });

  it('a document from before keeps its fingerprint (signed copies stay current)', () => {
    const doc = proforma([line(1000)]);
    const was = pdfFingerprint(doc);
    expect(pdfFingerprint({ ...doc, showUnits: false })).toBe(was);
    expect(pdfFingerprint({ ...doc, showUnits: true })).not.toBe(was);
  });
});

describe('a copy in the same project', () => {
  it('points back at its source, so it groups with it', () => {
    const { doc, company } = exampleData('2026-11-11');
    const source = { ...doc, example: undefined, companyId: company.id };
    const alone = duplicateDocument(source, company, '2026-11-11').doc;
    const kept = duplicateDocument(source, company, '2026-11-11', true).doc;
    expect(alone.sourceId).toBeUndefined();
    expect(kept.sourceId).toBe(source.id);
    expect(journeyOf(kept, [source, kept]).members.map((d) => d.id)).toEqual([source.id, kept.id]);
  });
});
