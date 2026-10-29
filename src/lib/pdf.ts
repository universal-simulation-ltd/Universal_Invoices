import { businessDocToPdf, type BusinessPdfResult } from '@unisim/doc';
import { toBusinessDoc } from './convert';
import type { InvoiceDoc } from './types';

/**
 * The PDF for one document. The preview and the download are this same call,
 * so what you see is what you send.
 */
export function renderPdf(doc: InvoiceDoc): BusinessPdfResult {
  return businessDocToPdf(toBusinessDoc(doc), { producer: 'Universal Invoices' });
}
