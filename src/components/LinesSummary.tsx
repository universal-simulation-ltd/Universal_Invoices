import type { ReactNode } from 'react';
import { computeTotals, formatMoney, wantsDecimals } from '@unisim/doc';
import type { Discount, InvoiceDoc } from '../lib/types';
import { DiscountInput } from './ui';

const money = (doc: InvoiceDoc) => {
  const decimals = wantsDecimals({ lines: doc.lines, taxMode: doc.taxMode, discount: doc.discount, decimals: undefined });
  return (v: number) => formatMoney(v, doc.currency, doc.numberStyle, decimals);
};

/**
 * The document-wide discount and the totals, as the PDF prints them (@unisim/doc
 * 0.14.0): before tax, a row per rate — VAT 0% when none — then what is due.
 * In the Lines section and in the card a click on the preview's totals opens.
 */
export function TotalsFields({ doc, onDiscount }: { doc: InvoiceDoc; onDiscount: (d: Discount | undefined) => void }) {
  const totals = computeTotals(doc);
  const m = money(doc);
  return (
    <dl className="tabular ml-auto max-w-xs space-y-1 text-sm">
      <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-400">
        <dt>
          <label htmlFor={`doc-discount-${doc.id}`} title="Off the whole document, before VAT: 10% or an amount">
            Overall discount
          </label>
        </dt>
        <dd className="w-28">
          <DiscountInput value={doc.discount} onChange={onDiscount} style={doc.numberStyle} ariaLabel="Overall discount" />
        </dd>
      </div>
      {totals.discount > 0 && (
        <>
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <dt>Subtotal</dt>
            <dd>{m(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <dt>Discount{doc.discount && 'percent' in doc.discount ? ` ${doc.discount.percent}%` : ''}</dt>
            <dd>{m(-totals.discount)}</dd>
          </div>
        </>
      )}
      <div className="flex justify-between text-slate-600 dark:text-slate-400">
        <dt>Total excl. VAT</dt>
        <dd>{m(totals.net)}</dd>
      </div>
      {(totals.taxes.length ? totals.taxes : [{ rate: 0, tax: 0 }]).map((t) => (
        <div key={t.rate} className="flex justify-between text-slate-600 dark:text-slate-400">
          <dt>VAT {t.rate}%</dt>
          <dd>{m(t.tax)}</dd>
        </div>
      ))}
      <div className="flex justify-between text-base font-semibold text-slate-900 dark:text-slate-100">
        <dt>Total due</dt>
        <dd>{m(totals.gross)}</dd>
      </div>
    </dl>
  );
}

/**
 * The Lines section, since the full line table (LinesEditor) was retired
 * (James, 2026-11-10: "do the rest" of the backlog's "retire the Lines
 * section once editing on the page has proved itself"). A line is edited in
 * the card on the preview; this is the list of them, one row each, which opens
 * that card — or, where the preview cannot take it (a phone's form pane, a
 * signed copy on show), the same fields under the row. It keeps every line
 * reachable from the keyboard, which the picture of the page is not.
 */
export default function LinesSummary({
  doc,
  open,
  editor,
  onOpen,
  actions,
  onDiscount,
}: {
  doc: InvoiceDoc;
  /** The line whose fields are open under its row here, if any. */
  open: number | null;
  editor: ReactNode;
  onOpen: (line: number) => void;
  /** + Add line, + From catalogue. */
  actions: ReactNode;
  onDiscount: (d: Discount | undefined) => void;
}) {
  const priced = doc.kind !== 'delivery-note';
  const totals = computeTotals(doc);
  const m = money(doc);
  return (
    <div className="space-y-3">
      {doc.lines.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          No lines yet. Add one from your catalogue, or a blank one.
        </p>
      ) : (
        <ol className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {doc.lines.map((line, i) => (
            <li key={line.id}>
              <button
                type="button"
                aria-expanded={open === i}
                onClick={() => onOpen(i)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-orange-50/60 dark:hover:bg-slate-800/60 ${open === i ? 'bg-orange-50 dark:bg-slate-800' : ''}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  {line.image ? <img src={line.image.dataUrl} alt="" className="h-full w-full object-contain" /> : <span className="text-[10px] text-slate-400">{i + 1}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-900 dark:text-slate-100">
                    {line.code && <span className="mr-1.5 font-medium text-slate-500 dark:text-slate-400">{line.code}</span>}
                    {line.description.split('\n')[0] || <span className="italic text-slate-400">No description</span>}
                  </span>
                  <span className="tabular block text-xs text-slate-500 dark:text-slate-400">
                    {line.quantity}
                    {line.unit ? ` ${line.unit}` : ''}
                    {priced && ` × ${m(line.unitPrice)}`}
                    {priced && line.discount && ('percent' in line.discount ? ` −${line.discount.percent}%` : ` −${m(line.discount.amount)} each`)}
                  </span>
                </span>
                {priced && <span className="tabular shrink-0 font-medium text-slate-900 dark:text-slate-100">{m(totals.lines[i])}</span>}
              </button>
              {open === i && <div className="border-t border-orange-200 bg-white p-3 dark:border-orange-900 dark:bg-slate-900">{editor}</div>}
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
      {priced && doc.lines.length > 0 && (
        <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
          <TotalsFields doc={doc} onDiscount={onDiscount} />
        </div>
      )}
    </div>
  );
}
