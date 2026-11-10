import { computeTotals, formatMoney, wantsDecimals } from '@unisim/doc';
import { arrange, cataloguePictures } from '../lib/arrange';
import { blankLine, lineFromProduct } from '../lib/convert';
import type { DocLine, Discount, Folder, InvoiceDoc, Product } from '../lib/types';
import { type PictureChoice } from './ImagePicker';
import LineFields from './LineFields';
import { DiscountInput, btnGhost, selectBase } from './ui';

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
  const pictures: PictureChoice[] = cataloguePictures(products, folders);

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
          <LineFields
            doc={doc}
            index={i}
            pictures={pictures}
            total={money(totals.lines[i])}
            onSet={(patch) => set(i, patch)}
            onMove={(by) => move(i, by)}
            onRemove={() => onChange(doc.lines.filter((_, n) => n !== i))}
          />
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
