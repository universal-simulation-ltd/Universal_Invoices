import { useShownKinds } from './shownKinds';

/** Tune this app ▸ "Hide invoices" (shownKinds.ts). Unticked by default, like every switch in the suite. */
export default function HideInvoicesPreference() {
  const { hideInvoices, setHideInvoices } = useShownKinds();
  return (
    <label className="flex items-start gap-3 py-2">
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-orange-600" checked={hideInvoices} onChange={(e) => setHideInvoices(e.target.checked)} />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-200">Hide invoices</span>
        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
          For when you send invoices from somewhere else, such as a French e-invoicing platform. Quotes, proformas and delivery notes stay; invoices you already made stay too.
        </span>
      </span>
    </label>
  );
}
