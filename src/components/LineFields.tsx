import { GrowingTextarea } from '@unisim/sdk';
import type { DocLine, InvoiceDoc } from '../lib/types';
import ImagePicker, { type PictureChoice } from './ImagePicker';
import UnitSelect from './UnitSelect';
import { DecimalInput, DiscountInput, MoneyInput, btnIcon, inputCls, labelCls } from './ui';

/**
 * One line's fields: picture, code, description, quantity, unit, price,
 * discount, VAT and its total, with move and remove. Shared by the Lines
 * section of the form and the editor that opens on a row of the preview
 * (James, 2026-11-10: "edit directly onto the PDF preview"), so the two can
 * never drift apart.
 */
export default function LineFields({
  doc,
  index,
  pictures,
  total,
  onSet,
  onMove,
  onRemove,
  autoFocus,
}: {
  doc: InvoiceDoc;
  index: number;
  pictures: PictureChoice[];
  /** The line's total, formatted. */
  total: string;
  onSet: (patch: Partial<DocLine>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  /** Put the cursor in the description (a row just opened on the preview). */
  autoFocus?: boolean;
}) {
  const line = doc.lines[index];
  const priced = doc.kind !== 'delivery-note';
  const taxed = doc.taxMode === 'standard';
  return (
    <>
      <div className="flex items-start gap-3">
        <ImagePicker compact value={line.image} onChange={(image) => onSet({ image })} maxEdge={240} label="picture" choices={pictures} />
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <input className={inputCls} placeholder="Code" aria-label="Code" value={line.code} onChange={(e) => onSet({ code: e.target.value })} />
          <GrowingTextarea
            // Grows with its text (SDK); two rows to start, so a phone
            // shows more than half a line.
            className={`${inputCls} resize-y`}
            rows={2}
            placeholder="Description"
            aria-label="Description"
            autoFocus={autoFocus}
            value={line.description}
            onChange={(e) => onSet({ description: e.target.value })}
          />
        </div>
        <div className="flex shrink-0 flex-col">
          <button type="button" className={btnIcon} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up" title="Move up">
            ↑
          </button>
          <button type="button" className={btnIcon} disabled={index === doc.lines.length - 1} onClick={() => onMove(1)} aria-label="Move down" title="Move down">
            ↓
          </button>
          <button type="button" className={`${btnIcon} hover:text-red-600`} onClick={onRemove} aria-label="Remove line" title="Remove line">
            ✕
          </button>
        </div>
      </div>
      <div className={`mt-2 grid grid-cols-2 gap-2 ${priced ? (taxed ? 'sm:grid-cols-6' : 'sm:grid-cols-5') : 'sm:grid-cols-4'}`}>
        <label className="min-w-0">
          <span className={labelCls}>Qty</span>
          <DecimalInput value={line.quantity} onChange={(v) => onSet({ quantity: v ?? 0 })} ariaLabel="Quantity" />
        </label>
        <label className="min-w-0">
          <span className={labelCls}>Unit</span>
          <UnitSelect value={line.unit} onChange={(unit) => onSet({ unit })} />
        </label>
        {priced && (
          <>
            <label className="min-w-0">
              <span className={labelCls}>Price</span>
              <MoneyInput value={line.unitPrice} onChange={(v) => onSet({ unitPrice: v ?? 0 })} style={doc.numberStyle} ariaLabel="Unit price" />
            </label>
            <label className="min-w-0" title="Off each unit: 10% or an amount. The PDF shows the price struck through above the discounted one.">
              <span className={labelCls}>Discount</span>
              <DiscountInput value={line.discount} onChange={(discount) => onSet({ discount })} style={doc.numberStyle} ariaLabel="Discount on this line" />
            </label>
            {taxed && (
              <label className="min-w-0">
                <span className={labelCls}>VAT %</span>
                <DecimalInput value={line.taxRate} onChange={(taxRate) => onSet({ taxRate })} ariaLabel="VAT rate" placeholder="0" />
              </label>
            )}
            <div className="min-w-0">
              <span className={labelCls}>Total</span>
              <div className="tabular py-2 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">{total}</div>
            </div>
          </>
        )}
      </div>
      {/* Only while the document prints origins, so it doesn't crowd every line. */}
      {doc.showOrigin && (
        <label className="mt-2 block min-w-0 sm:max-w-xs">
          <span className={labelCls}>Country of origin</span>
          <input className={inputCls} value={line.origin ?? ''} placeholder="e.g. France" aria-label="Country of origin" onChange={(e) => onSet({ origin: e.target.value || undefined })} />
        </label>
      )}
    </>
  );
}
