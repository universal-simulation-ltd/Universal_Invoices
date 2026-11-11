// A customs-friendly copy of a document (James, 2026-11-11: "a lot of buyers
// ask for the final proforma / invoice not to include discounts and to build
// it into the prices. Some ask for the delivery fee not to be shown, and when
// we charge the delivery per product they ask for it to appear as a single
// item, just with the total"). Pure: the editor's Customs copy panel shows
// what this gives back and saves it as a new document in the same project.
//
// The total stays what was agreed unless you choose to leave delivery off:
// prices are rounded to the cent and then nudged a cent or two (landOn, the
// same as the currency conversion) so the copy comes to the same amount.

import { computeTotals, discountOff, lineTotal, unitNet } from '@unisim/doc';
import { landOn } from './currencyConvert';
import { uid } from './convert';
import type { Discount, DocLine, InvoiceDoc } from './types';

/**
 * What to do with the delivery lines:
 *   keep   — leave them as they are
 *   single — one line, "Delivery", with their total (no breakdown per product)
 *   spread — built into the other lines' prices, so delivery is not shown
 *   drop   — left off; the total goes down by their amount
 */
export type DeliveryChoice = 'keep' | 'single' | 'spread' | 'drop';

export interface CustomsOptions {
  /** Line and whole-document discounts built into the prices. */
  foldDiscounts: boolean;
  /** The lines that are delivery (ids). */
  deliveryIds: string[];
  delivery: DeliveryChoice;
}

export interface CustomsCopy {
  lines: DocLine[];
  discount: InvoiceDoc['discount'];
  /** The copy's total (gross, minor units). */
  total: number;
}

/** Delivery, shipping, freight, carriage… in English or French: the lines ticked to start with. */
const DELIVERY_WORDS = /\b(deliver(y|ies)?|shipping|shipment|freight|carriage|transport|postage|courier|livraison|exp[ée]dition|frais de port|port|fret)\b/i;

export function looksLikeDelivery(line: Pick<DocLine, 'code' | 'description'>): boolean {
  return DELIVERY_WORDS.test(`${line.code} ${line.description}`);
}

/** The single delivery line's description, in the document's language. */
const DELIVERY_NAME: Record<InvoiceDoc['language'], string> = { en: 'Delivery', fr: 'Livraison' };

const scaleDiscount = (d: Discount | undefined, rate: number): Discount | undefined =>
  d && 'amount' in d ? { amount: Math.round(d.amount * rate) } : d;

export function customsCopy(doc: InvoiceDoc, opts: CustomsOptions): CustomsCopy {
  const isDelivery = new Set(opts.deliveryIds);
  const delivery = doc.lines.filter((l) => isDelivery.has(l.id));
  const goods = doc.lines.filter((l) => !isDelivery.has(l.id));
  const totalOf = (lines: DocLine[], discount: InvoiceDoc['discount']) => computeTotals({ ...doc, lines, discount }).gross;
  const before = totalOf(doc.lines, doc.discount);

  let lines = doc.lines;
  let discount = doc.discount;
  let target = before;

  if (delivery.length && opts.delivery !== 'keep') {
    const deliveryNet = delivery.reduce((sum, l) => sum + lineTotal(l), 0);
    if (opts.delivery === 'single') {
      // One line where the first delivery line was, at the delivery lines' total.
      const at = doc.lines.findIndex((l) => isDelivery.has(l.id));
      const rates = new Set(delivery.map((l) => l.taxRate));
      const one: DocLine = {
        id: uid(),
        code: '',
        description: DELIVERY_NAME[doc.language],
        quantity: 1,
        unit: '',
        unitPrice: deliveryNet,
        ...(rates.size === 1 && delivery[0].taxRate !== undefined ? { taxRate: delivery[0].taxRate } : {}),
      };
      lines = doc.lines.filter((l) => !isDelivery.has(l.id));
      lines.splice(Math.min(at, lines.length), 0, one);
      // Mixed VAT rates on the delivery lines cannot add up exactly on one line: land on the total anyway.
      lines = landOn(target, lines, (ls) => totalOf(ls, discount));
    } else if (opts.delivery === 'spread' && goods.length) {
      // The goods' prices (and any discount given as an amount) times the same
      // rate, so delivery is inside them and the total is unchanged.
      const goodsNet = goods.reduce((sum, l) => sum + lineTotal(l), 0);
      const rate = goodsNet > 0 ? (goodsNet + deliveryNet) / goodsNet : 1;
      lines = goods.map((l) => ({ ...l, unitPrice: Math.round(l.unitPrice * rate), discount: scaleDiscount(l.discount, rate) }));
      lines = landOn(target, lines, (ls) => totalOf(ls, discount));
    } else if (opts.delivery === 'drop') {
      lines = goods;
      target = totalOf(lines, discount);
    }
  }

  if (opts.foldDiscounts && (discount || lines.some((l) => l.discount))) {
    // Each line at its price after its own discount, then the whole
    // document's discount shared over every line by value.
    const subtotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);
    const off = subtotal > 0 ? discountOff(subtotal, discount) : 0;
    const share = subtotal > 0 ? (subtotal - off) / subtotal : 1;
    lines = lines.map((l) => {
      const out: DocLine = { ...l, unitPrice: Math.round(unitNet(l) * share) };
      delete out.discount;
      return out;
    });
    discount = undefined;
    lines = landOn(target, lines, (ls) => totalOf(ls, discount));
  }

  return { lines, discount, total: totalOf(lines, discount) };
}
