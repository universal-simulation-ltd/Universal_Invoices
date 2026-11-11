import { useId, useMemo, useState } from 'react';
import { computeTotals, formatMoney, lineTotal } from '@unisim/doc';
import { customsCopy, looksLikeDelivery, type DeliveryChoice } from '../lib/customs';
import { KIND_NAMES, type InvoiceDoc } from '../lib/types';
import { btnGhost, btnPrimary, card, checkboxCls, labelCls, sectionTitle } from './ui';

/**
 * "Customs copy…" in a document's More menu (James, 2026-11-11: buyers ask
 * for the final proforma or invoice without discounts, with them built into
 * the prices; some without delivery shown, or with per-product delivery as
 * one line). Makes a new document in the same project, this one left as it
 * is; the maths is lib/customs.ts, and the total stays what was agreed
 * unless delivery is left off.
 */
export default function CustomsCopy({ doc, onMake, onClose }: { doc: InvoiceDoc; onMake: (r: ReturnType<typeof customsCopy>) => void; onClose: () => void }) {
  const id = useId();
  const discounted = !!doc.discount || doc.lines.some((l) => l.discount);
  const [foldDiscounts, setFold] = useState(discounted);
  const [deliveryIds, setDeliveryIds] = useState(() => doc.lines.filter(looksLikeDelivery).map((l) => l.id));
  const [delivery, setDelivery] = useState<DeliveryChoice>(() => (doc.lines.filter(looksLikeDelivery).length > 1 ? 'single' : 'keep'));

  const money = (minor: number) => formatMoney(minor, doc.currency, doc.numberStyle, true);
  const before = computeTotals(doc).gross;
  const result = useMemo(() => customsCopy(doc, { foldDiscounts, deliveryIds, delivery }), [doc, foldDiscounts, deliveryIds, delivery]);
  const changes = (foldDiscounts && discounted) || (deliveryIds.length > 0 && delivery !== 'keep');
  const priced = doc.lines.filter((l) => l.description.trim() || l.code.trim() || l.unitPrice);

  const choices: { value: DeliveryChoice; label: string; hint: string }[] = [
    { value: 'keep', label: 'Show it as it is', hint: '' },
    { value: 'single', label: 'As one line, with the total', hint: 'No breakdown per product' },
    { value: 'spread', label: 'Built into the item prices', hint: 'Delivery is not shown; the total stays the same' },
    { value: 'drop', label: 'Leave it off', hint: 'The total goes down by the delivery' },
  ];

  return (
    <section className={card} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={sectionTitle}>
        Customs copy
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        A new {KIND_NAMES[doc.kind].toLowerCase()} with its own number, in the same project as this one, which stays as it is.
      </p>

      <div className="mt-4 space-y-4">
        {discounted && (
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" className={`${checkboxCls} mt-0.5`} checked={foldDiscounts} onChange={(e) => setFold(e.target.checked)} />
            <span>
              Build the discounts into the prices
              <span className="block text-xs text-slate-500 dark:text-slate-400">Each price becomes what was actually charged; no discount is printed.</span>
            </span>
          </label>
        )}

        <fieldset className="min-w-0">
          <legend className={labelCls}>Which lines are delivery?</legend>
          <div className="max-h-56 space-y-1 overflow-y-auto pt-1 text-sm text-slate-700 dark:text-slate-300">
            {priced.map((l) => (
              <label key={l.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={deliveryIds.includes(l.id)}
                  onChange={(e) => setDeliveryIds((ids) => (e.target.checked ? [...ids, l.id] : ids.filter((x) => x !== l.id)))}
                />
                <span className="min-w-0 flex-1 truncate">{[l.code, l.description.split('\n')[0]].filter(Boolean).join(' · ') || 'Untitled line'}</span>
                <span className="tabular shrink-0 text-slate-500 dark:text-slate-400">{money(lineTotal(l))}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {deliveryIds.length > 0 && (
          <fieldset className="min-w-0">
            <legend className={labelCls}>Delivery on the copy</legend>
            <div className="space-y-1 pt-1 text-sm text-slate-700 dark:text-slate-300">
              {choices.map((c) => (
                <label key={c.value} className="flex items-start gap-2">
                  <input type="radio" className="mt-1 accent-orange-600" name={`${id}-delivery`} checked={delivery === c.value} onChange={() => setDelivery(c.value)} />
                  <span>
                    {c.label}
                    {c.hint && <span className="text-slate-500 dark:text-slate-400"> — {c.hint}</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <p className="tabular text-sm text-slate-700 dark:text-slate-200" aria-live="polite">
          {result.lines.length} line{result.lines.length === 1 ? '' : 's'} · total {money(before)}
          {result.total !== before && (
            <>
              {' '}→ <strong>{money(result.total)}</strong>
            </>
          )}
          {result.total !== before && delivery !== 'drop' && (
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
              The nearest whole-cent prices can reach: with these quantities, the total moves a few cents at a time.
            </span>
          )}
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={!changes} onClick={() => onMake(result)}>
            Make the customs copy
          </button>
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}
