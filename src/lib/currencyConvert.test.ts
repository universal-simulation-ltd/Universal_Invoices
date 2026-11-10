import { describe, expect, it } from 'vitest';
import { computeTotals } from '@unisim/doc';
import { convertPrices } from './currencyConvert';
import { exampleData } from './example';
import type { DocLine, InvoiceDoc } from './types';

const line = (unitPrice: number, quantity = 1, extra: Partial<DocLine> = {}): DocLine => ({
  id: `l${unitPrice}-${quantity}`,
  code: '',
  description: 'Item',
  quantity,
  unit: '',
  unitPrice,
  ...extra,
});

const proforma = (lines: DocLine[], patch: Partial<InvoiceDoc> = {}): InvoiceDoc => ({
  ...exampleData('2026-11-10').doc,
  currency: 'EUR',
  taxMode: 'export-exempt',
  discount: undefined,
  lines,
  ...patch,
});

describe('convertPrices', () => {
  it('80 000 EUR to exactly 95 000 USD — the case it was built for', () => {
    const doc = proforma([line(5_000_000), line(1_733_333, 1), line(1_266_667, 1)]);
    expect(computeTotals(doc).gross).toBe(8_000_000);
    const r = convertPrices(doc, 'USD', { total: 9_500_000 })!;
    expect(r.currency).toBe('USD');
    expect(r.rate).toBeCloseTo(1.1875, 10);
    expect(r.total).toBe(9_500_000);
    expect(computeTotals({ ...doc, lines: r.lines, discount: r.discount }).gross).toBe(9_500_000);
  });

  it('lands on the exact total with tax on each line, nudging a line bought once', () => {
    const doc = proforma([line(33_333, 3, { taxRate: 20 }), line(12_345, 1, { taxRate: 20 })], { taxMode: 'standard' });
    const r = convertPrices(doc, 'USD', { total: 1_234_567 })!;
    expect(r.total).toBe(1_234_567);
  });

  it('a rate multiplies every price and leaves percentages alone', () => {
    const doc = proforma([line(10_000, 2, { discount: { percent: 10 } }), line(25_000, 1, { discount: { amount: 1_000 } })], {
      discount: { amount: 2_000 },
    });
    const r = convertPrices(doc, 'GBP', { rate: 0.85 })!;
    expect(r.lines.map((l) => l.unitPrice)).toEqual([8_500, 21_250]);
    expect(r.lines[0].discount).toEqual({ percent: 10 });
    expect(r.lines[1].discount).toEqual({ amount: 850 });
    expect(r.discount).toEqual({ amount: 1_700 });
    expect(r.rate).toBe(0.85);
  });

  it('keeps quantities, descriptions and the rest of each line', () => {
    const doc = proforma([line(1_000, 4, { description: 'Bolts', unit: 'box' })]);
    const r = convertPrices(doc, 'USD', { rate: 2 })!;
    expect(r.lines[0]).toMatchObject({ description: 'Bolts', unit: 'box', quantity: 4, unitPrice: 2_000 });
  });

  it('refuses nonsense: no total to scale from, a zero or negative rate', () => {
    expect(convertPrices(proforma([]), 'USD', { total: 100 })).toBeNull();
    expect(convertPrices(proforma([line(100)]), 'USD', { rate: 0 })).toBeNull();
    expect(convertPrices(proforma([line(100)]), 'USD', { rate: -1 })).toBeNull();
  });
});

describe('convertPrices — landing on the total', () => {
  it('reaches it with no line bought once, using two lines together', () => {
    const doc = proforma([line(10_000, 2), line(10_000, 3)]);
    const r = convertPrices(doc, 'USD', { total: 1_234_567 })!;
    expect(r.total).toBe(1_234_567);
  });

  it('comes as close as it can when no prices land exactly (the example: even quantities and 20% VAT)', () => {
    // Every line is bought an even number of times, so the net moves 2 cents
    // at a time and the gross jumps 94 999,99 → 95 000,02: 95 000,00 cannot be
    // made from whole-cent prices at all.
    const { doc } = exampleData('2026-11-10');
    const r = convertPrices(doc, 'EUR', { total: 9_500_000 })!;
    expect(Math.abs(r.total - 9_500_000)).toBeLessThanOrEqual(3);
  });
});
