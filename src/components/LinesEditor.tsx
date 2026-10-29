import { computeTotals, formatMoney, wantsDecimals } from '@unisim/doc';
import { blankLine, lineFromProduct } from '../lib/convert';
import type { DocLine, InvoiceDoc, Product } from '../lib/types';
import ImagePicker from './ImagePicker';
import { DecimalInput, MoneyInput, btnGhost, btnIcon, inputCls, labelCls, selectBase } from './ui';

/**
 * The line table. Two rows per line rather than one wide one: the editor is
 * half a screen wide on a laptop and a whole (narrow) one on a phone, and the
 * description is the field that needs the room.
 */
export default function LinesEditor({
  doc,
  products,
  defaultTaxRate,
  onChange,
}: {
  doc: InvoiceDoc;
  products: Product[];
  defaultTaxRate: number;
  onChange: (lines: DocLine[]) => void;
}) {
  const priced = doc.kind !== 'delivery-note';
  const taxed = doc.taxMode === 'standard';
  const totals = computeTotals({ lines: doc.lines, taxMode: doc.taxMode });
  const decimals = wantsDecimals({ lines: doc.lines, taxMode: doc.taxMode, decimals: undefined });
  const money = (v: number) => formatMoney(v, doc.currency, doc.numberStyle, decimals);

  const set = (i: number, patch: Partial<DocLine>) => onChange(doc.lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...doc.lines];
    const [line] = next.splice(i, 1);
    next.splice(i + by, 0, line);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {doc.lines.length === 0 && (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          No lines yet. Add one from your catalogue, or a blank one.
        </p>
      )}
      {doc.lines.map((line, i) => (
        <div key={line.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <ImagePicker compact value={line.image} onChange={(image) => set(i, { image })} maxEdge={240} label="picture" />
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <input className={inputCls} placeholder="Code" aria-label="Code" value={line.code} onChange={(e) => set(i, { code: e.target.value })} />
              <textarea
                // Grows with its text where the browser can (field-sizing); two
                // rows otherwise, so a phone shows more than half a line.
                className={`${inputCls} resize-y [field-sizing:content]`}
                rows={Math.min(5, Math.max(2, line.description.split('\n').length))}
                placeholder="Description"
                aria-label="Description"
                value={line.description}
                onChange={(e) => set(i, { description: e.target.value })}
              />
            </div>
            <div className="flex shrink-0 flex-col">
              <button type="button" className={btnIcon} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" title="Move up">
                ↑
              </button>
              <button type="button" className={btnIcon} disabled={i === doc.lines.length - 1} onClick={() => move(i, 1)} aria-label="Move down" title="Move down">
                ↓
              </button>
              <button
                type="button"
                className={`${btnIcon} hover:text-red-600`}
                onClick={() => onChange(doc.lines.filter((_, n) => n !== i))}
                aria-label="Remove line"
                title="Remove line"
              >
                ✕
              </button>
            </div>
          </div>
          <div className={`mt-2 grid grid-cols-2 gap-2 ${priced ? (taxed ? 'sm:grid-cols-6' : 'sm:grid-cols-5') : 'sm:grid-cols-4'}`}>
            <label className="min-w-0">
              <span className={labelCls}>Qty</span>
              <DecimalInput value={line.quantity} onChange={(v) => set(i, { quantity: v ?? 0 })} ariaLabel="Quantity" />
            </label>
            <label className="min-w-0">
              <span className={labelCls}>Unit</span>
              <input className={inputCls} placeholder="unit, day…" value={line.unit} onChange={(e) => set(i, { unit: e.target.value })} />
            </label>
            {priced && (
              <>
                <label className="min-w-0" title="Optional. Printed struck through above the price when it is higher.">
                  <span className={labelCls}>List price</span>
                  <MoneyInput value={line.listPrice} onChange={(listPrice) => set(i, { listPrice })} style={doc.numberStyle} placeholder="—" ariaLabel="List price" />
                </label>
                <label className="min-w-0">
                  <span className={labelCls}>Price</span>
                  <MoneyInput value={line.unitPrice} onChange={(v) => set(i, { unitPrice: v ?? 0 })} style={doc.numberStyle} ariaLabel="Unit price" />
                </label>
                {taxed && (
                  <label className="min-w-0">
                    <span className={labelCls}>VAT %</span>
                    <DecimalInput value={line.taxRate} onChange={(taxRate) => set(i, { taxRate })} ariaLabel="VAT rate" placeholder="0" />
                  </label>
                )}
                <div className="min-w-0">
                  <span className={labelCls}>Total</span>
                  <div className="tabular py-2 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">{money(totals.lines[i])}</div>
                </div>
              </>
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {products.length > 0 && (
          <select
            className={selectBase}
            value=""
            aria-label="Add from your catalogue"
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              if (p) onChange([...doc.lines, lineFromProduct(p)]);
            }}
          >
            <option value="">+ Add from catalogue…</option>
            {[...products]
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {[p.code, p.description.split('\n')[0]].filter(Boolean).join(' — ').slice(0, 80)}
                </option>
              ))}
          </select>
        )}
        <button type="button" className={btnGhost} onClick={() => onChange([...doc.lines, blankLine(taxed ? defaultTaxRate : undefined)])}>
          + Blank line
        </button>
      </div>

      {priced && doc.lines.length > 0 && (
        <dl className="tabular ml-auto max-w-xs space-y-1 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
          {taxed && totals.taxes.length > 0 && (
            <>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <dt>Total excl. VAT</dt>
                <dd>{money(totals.net)}</dd>
              </div>
              {totals.taxes.map((t) => (
                <div key={t.rate} className="flex justify-between text-slate-600 dark:text-slate-400">
                  <dt>VAT {t.rate}%</dt>
                  <dd>{money(t.tax)}</dd>
                </div>
              ))}
            </>
          )}
          <div className="flex justify-between text-base font-semibold text-slate-900 dark:text-slate-100">
            <dt>Total</dt>
            <dd>{money(totals.gross)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
