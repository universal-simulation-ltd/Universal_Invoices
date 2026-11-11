// Changing a document's currency AND its prices (James, 2026-11-10: a proforma
// of 80 000 EUR wanted again as one that comes to 95 000 USD). The Currency
// field on its own only changes the symbol; this multiplies every amount by a
// rate: each line's unit price, a line discount given as an amount, and the
// whole document's discount when it is an amount. Percentages and tax rates
// stay as they are, so the total moves by the same factor.

import { computeTotals } from '@unisim/doc';
import type { Discount, DocLine, InvoiceDoc } from './types';

export type ConvertBy = { rate: number } | { total: number };

export interface Converted {
  currency: InvoiceDoc['currency'];
  lines: DocLine[];
  discount: InvoiceDoc['discount'];
  /** The rate used: the one given, or the one the target total implies. */
  rate: number;
  /** The new total (gross, minor units). */
  total: number;
}

const scaleDiscount = (d: Discount | undefined, rate: number): Discount | undefined =>
  d && 'amount' in d ? { amount: Math.round(d.amount * rate) } : d;

/**
 * Every amount on `doc` times the rate. With a target total, the rate is
 * target ÷ today's total, and rounding each price to the cent can leave the
 * new total a few cents out: then a line's unit price moves by a few cents
 * (see `landOn`), so the total is exactly what was asked for wherever that is
 * possible. Null when there is nothing to convert or the input is not usable.
 */
export function convertPrices(doc: InvoiceDoc, currency: InvoiceDoc['currency'], by: ConvertBy): Converted | null {
  const before = computeTotals(doc).gross;
  const rate = 'rate' in by ? by.rate : before > 0 ? by.total / before : NaN;
  if (!Number.isFinite(rate) || rate <= 0) return null;

  let lines: DocLine[] = doc.lines.map((l) => ({ ...l, unitPrice: Math.round(l.unitPrice * rate), discount: scaleDiscount(l.discount, rate) }));
  const discount = scaleDiscount(doc.discount, rate);
  const totalOf = (ls: DocLine[]) => computeTotals({ ...doc, lines: ls, discount }).gross;

  if ('total' in by) lines = landOn(Math.round(by.total), lines, totalOf);

  return { currency, lines, discount, rate, total: totalOf(lines) };
}

/**
 * Nudge unit prices by a few cents until the total is `target`. One line
 * first, the fewest units first (a line bought once moves the total cent for
 * cent; ten of something move it ten at a time), then two lines together for
 * the totals no single line can reach (quantities and VAT rounding). Gives
 * back the lines unchanged when nothing nearby lands exactly.
 */
export function landOn(target: number, lines: DocLine[], totalOf: (ls: DocLine[]) => number): DocLine[] {
  if (totalOf(lines) === target) return lines;
  const off = target - totalOf(lines);
  const order = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.unitPrice > 0 && l.quantity > 0)
    .sort((a, b) => a.l.quantity - b.l.quantity || b.l.unitPrice - a.l.unitPrice)
    .map(({ i }) => i);
  const nudged = (moves: [number, number][]) =>
    lines.map((l, n) => {
      const m = moves.find(([i]) => i === n);
      return m ? { ...l, unitPrice: l.unitPrice + m[1] } : l;
    });
  const ok = (ls: DocLine[]) => ls.every((l) => l.unitPrice >= 0) && totalOf(ls) === target;
  // Deltas nearest zero first, so the smallest change wins.
  const deltas = (reach: number) => [0, ...Array.from({ length: reach }, (_, k) => [k + 1, -(k + 1)]).flat()].filter((d) => d !== 0);

  for (const i of order) {
    const q = lines[i].quantity;
    const centre = Math.round(off / q);
    for (const d of [centre, ...deltas(Math.abs(centre) + 6).map((x) => centre + x)]) {
      const tried = nudged([[i, d]]);
      if (ok(tried)) return tried;
    }
  }
  const few = order.slice(0, 6);
  for (let a = 0; a < few.length; a++) {
    for (let b = a + 1; b < few.length; b++) {
      for (const da of deltas(8)) {
        for (const db of deltas(8)) {
          const tried = nudged([[few[a], da], [few[b], db]]);
          if (ok(tried)) return tried;
        }
      }
    }
  }
  return lines;
}
