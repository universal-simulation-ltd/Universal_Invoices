// Rows saved by older versions, brought up to date wherever rows come in:
// loading this browser's, the online copy, a backup file. Pure.
//
// 2026-11-03: the struck-through "list price" became discounts. A line whose
// list price was above its price is now that list price less a discount of
// the difference, per unit — the same total to the cent, so nothing already
// issued changes. A catalogue item keeps its price (what it was sold at) and
// loses the list price.

import type { Dataset } from './backup';
import type { DocLine, InvoiceDoc, Product } from './types';

type Old<T> = T & { listPrice?: number };

function line(l: Old<DocLine>): DocLine {
  if (!('listPrice' in l)) return l;
  const { listPrice, ...rest } = l;
  return listPrice !== undefined && listPrice > rest.unitPrice && !rest.discount
    ? { ...rest, unitPrice: listPrice, discount: { amount: listPrice - rest.unitPrice } }
    : rest;
}

function product(p: Old<Product>): Product {
  if (!('listPrice' in p)) return p;
  const rest = { ...p };
  delete rest.listPrice;
  return rest;
}

function doc(d: InvoiceDoc): InvoiceDoc {
  return d.lines.some((l) => 'listPrice' in l) ? { ...d, lines: d.lines.map(line) } : d;
}

/** The rows that needed changing come back as new objects; the rest as they were. */
export function upgrade<T extends Partial<Dataset>>(data: T): T {
  return {
    ...data,
    ...(data.products ? { products: data.products.map(product) } : {}),
    ...(data.documents ? { documents: data.documents.map(doc) } : {}),
  };
}

/** Which rows `upgrade` changed, to write back. */
export function changedBy<T extends { id: string }>(before: T[], after: T[]): T[] {
  return after.filter((row, i) => row !== before[i]);
}
