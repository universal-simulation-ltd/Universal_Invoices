import { computeTotals, formatMoney, wantsDecimals } from '@unisim/doc';
import { arrange } from '../lib/arrange';
import { blankLine, lineFromProduct } from '../lib/convert';
import type { DocLine, Discount, Folder, InvoiceDoc, Product } from '../lib/types';
import ImagePicker, { type PictureChoice } from './ImagePicker';
import UnitSelect from './UnitSelect';
import { DecimalInput, DiscountInput, MoneyInput, btnGhost, btnIcon, inputCls, labelCls, selectBase } from './ui';

/**
 * The line table. Two rows per line rather than one wide one: the editor is
 * half a screen wide on a laptop and a whole (narrow) one on a phone, and the
 * description is the field that needs the room.
 */
export default function LinesEditor({
  doc,
  products,
  folders,
  defaultTaxRate,
  onChange,
  onDiscount,
}: {
  doc: InvoiceDoc;
  products: Product[];
  /** The catalogue's folders: the picker groups by them, in the catalogue's order. */
  folders: Folder[];
  defaultTaxRate: number;
  onChange: (lines: DocLine[]) => void;
  /** The whole document's discount. */
  onDiscount: (discount: Discount | undefined) => void;
}) {
  const priced = doc.kind !== 'delivery-note';
  const taxed = doc.taxMode === 'standard';
  const totals = computeTotals(doc);
  const decimals = wantsDecimals({ lines: doc.lines, taxMode: doc.taxMode, discount: doc.discount, decimals: undefined });
  const money = (v: number) => formatMoney(v, doc.currency, doc.numberStyle, decimals);

  // The catalogue's pictures, in its own order, to pick for a line.
  const pictures: PictureChoice[] = arrange(products, folders)
    .flatMap((e) => (e.kind === 'folder' ? e.items : [e.product]))
    .filter((p) => p.image)
    .map((p) => ({ id: p.id, label: [p.code, p.description.split('\n')[0]].filter(Boolean).join(' — '), image: p.image! }));

  const option = (p: Product) => (
    <option key={p.id} value={p.id}>
      {[p.code, p.description.split('\n')[0]].filter(Boolean).join(' — ').slice(0, 80)}
    </option>
  );
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
            <ImagePicker compact value={line.image} onChange={(image) => set(i, { image })} maxEdge={240} label="picture" choices={pictures} />
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
              <UnitSelect value={line.unit} onChange={(unit) => set(i, { unit })} />
            </label>
            {priced && (
              <>
                <label className="min-w-0">
                  <span className={labelCls}>Price</span>
                  <MoneyInput value={line.unitPrice} onChange={(v) => set(i, { unitPrice: v ?? 0 })} style={doc.numberStyle} ariaLabel="Unit price" />
                </label>
                <label className="min-w-0" title="Off each unit: 10% or an amount. The PDF shows the price struck through above the discounted one.">
                  <span className={labelCls}>Discount</span>
                  <DiscountInput value={line.discount} onChange={(discount) => set(i, { discount })} style={doc.numberStyle} ariaLabel="Discount on this line" />
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
            {arrange(products, folders).map((e) =>
              e.kind === 'folder' ? (
                e.items.length > 0 && (
                  <optgroup key={e.folder.id} label={e.folder.name}>
                    {e.items.map(option)}
                  </optgroup>
                )
              ) : (
                option(e.product)
              ),
            )}
          </select>
        )}
        <button type="button" className={btnGhost} onClick={() => onChange([...doc.lines, blankLine(taxed ? defaultTaxRate : undefined)])}>
          + Blank line
        </button>
      </div>

      {priced && doc.lines.length > 0 && (
        <dl className="tabular ml-auto max-w-xs space-y-1 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
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
                <dd>{money(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <dt>Discount{doc.discount && 'percent' in doc.discount ? ` ${doc.discount.percent}%` : ''}</dt>
                <dd>{money(-totals.discount)}</dd>
              </div>
            </>
          )}
          {/* As the PDF prints them (@unisim/doc 0.14.0): before tax, a row per rate — VAT 0% when none — then what is due. */}
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <dt>Total excl. VAT</dt>
            <dd>{money(totals.net)}</dd>
          </div>
          {(totals.taxes.length ? totals.taxes : [{ rate: 0, tax: 0 }]).map((t) => (
            <div key={t.rate} className="flex justify-between text-slate-600 dark:text-slate-400">
              <dt>VAT {t.rate}%</dt>
              <dd>{money(t.tax)}</dd>
            </div>
          ))}
          <div className="flex justify-between text-base font-semibold text-slate-900 dark:text-slate-100">
            <dt>Total due</dt>
            <dd>{money(totals.gross)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
