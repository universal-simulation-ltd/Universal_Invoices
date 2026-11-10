import { useId, useState } from 'react';
import { computeTotals, formatMoney } from '@unisim/doc';
import { convertPrices, type Converted } from '../lib/currencyConvert';
import type { InvoiceDoc } from '../lib/types';
import { DecimalInput, MoneyInput, btnGhost, btnPrimary, labelCls, selectCls } from './ui';

const CURRENCIES: { code: InvoiceDoc['currency']; name: string }[] = [
  { code: 'EUR', name: 'Euro (€)' },
  { code: 'GBP', name: 'Pound sterling (£)' },
  { code: 'USD', name: 'US dollar ($)' },
];

/**
 * "Convert the prices to another currency…" under the Currency field (James,
 * 2026-11-10: the same proforma at 80 000 EUR, wanted as one coming to
 * 95 000 USD). The Currency field changes only the symbol; this changes the
 * amounts too, by an exchange rate or to a total you name. The maths is
 * lib/currencyConvert.ts; this is the panel and its live before → after line.
 */
export default function CurrencyConvert({ doc, onConvert }: { doc: InvoiceDoc; onConvert: (r: Converted) => void }) {
  const panel = useId();
  const [open, setOpen] = useState(false);
  const others = CURRENCIES.filter((c) => c.code !== doc.currency);
  const [to, setTo] = useState<InvoiceDoc['currency']>(others[0].code);
  const [by, setBy] = useState<'total' | 'rate'>('total');
  const [rate, setRate] = useState<number | undefined>();
  const [total, setTotal] = useState<number | undefined>();

  const target = others.some((c) => c.code === to) ? to : others[0].code;
  const before = computeTotals(doc).gross;
  const money = (minor: number, currency: InvoiceDoc['currency']) => formatMoney(minor, currency, doc.numberStyle, true);
  const result =
    by === 'rate' ? (rate ? convertPrices(doc, target, { rate }) : null) : total ? convertPrices(doc, target, { total }) : null;

  if (!doc.lines.length || before <= 0) return null;

  return (
    <div className="sm:col-span-2">
      <button
        type="button"
        className={`${btnGhost} text-sm`}
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
      >
        Convert the prices to another currency…
      </button>
      {open && (
        <div id={panel} className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Every price and every discount given as an amount is multiplied by the same rate. Percentages and VAT rates stay as they are.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className={labelCls}>To</span>
              <select className={selectCls} value={target} onChange={(e) => setTo(e.target.value as InvoiceDoc['currency'])}>
                {others.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="min-w-0">
              <legend className={labelCls}>Convert by</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm text-slate-700 dark:text-slate-300">
                <label className="flex items-center gap-2">
                  <input type="radio" className="accent-orange-600" name={`${panel}-by`} checked={by === 'total'} onChange={() => setBy('total')} />
                  The new total
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" className="accent-orange-600" name={`${panel}-by`} checked={by === 'rate'} onChange={() => setBy('rate')} />
                  An exchange rate
                </label>
              </div>
            </fieldset>
          </div>
          {by === 'total' ? (
            <label className="block min-w-0">
              <span className={labelCls}>New total in {target}</span>
              <MoneyInput value={total} onChange={setTotal} style={doc.numberStyle} placeholder={`Now ${money(before, doc.currency)}`} ariaLabel={`New total in ${target}`} />
            </label>
          ) : (
            <label className="block min-w-0">
              <span className={labelCls}>
                1 {doc.currency} = ? {target}
              </span>
              <DecimalInput value={rate} onChange={setRate} placeholder="e.g. 1.1875" ariaLabel={`How many ${target} for 1 ${doc.currency}`} />
            </label>
          )}
          <p className="tabular text-sm text-slate-700 dark:text-slate-200" aria-live="polite">
            {result ? (
              <>
                {money(before, doc.currency)} → <strong>{money(result.total, target)}</strong>
                <span className="text-slate-500 dark:text-slate-400"> · rate {Number(result.rate.toFixed(6))}</span>
                {by === 'total' && total !== undefined && result.total !== total && (
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                    The nearest whole-cent prices can reach: with these quantities and VAT, the total moves a few cents at a time.
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">Now {money(before, doc.currency)}.</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={!result}
              onClick={() => {
                if (!result) return;
                onConvert(result);
                setOpen(false);
                setRate(undefined);
                setTotal(undefined);
              }}
            >
              Convert to {target}
            </button>
            <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
