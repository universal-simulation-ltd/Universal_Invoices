import { formatMoney } from '@unisim/doc';
import { uid } from '../lib/convert';
import type { NumberStyle, Product } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import ImagePicker from './ImagePicker';
import RecordList from './RecordList';
import { DecimalInput, Field, MoneyInput, inputCls } from './ui';

export default function CatalogueView() {
  const { products, companies, saveProduct, deleteProduct } = useAppStore();
  // Prices are typed in the first company's number style — the one you work in.
  const style: NumberStyle = companies[0]?.defaults.numberStyle ?? 'en';
  const currency = companies[0]?.defaults.currency ?? 'EUR';
  const sorted = [...products].sort((a, b) => a.code.localeCompare(b.code));
  return (
    <RecordList<Product>
      rows={sorted}
      noun="product"
      make={() => ({ id: uid(), code: '', description: '', unit: '', unitPrice: 0, updatedAt: Date.now() })}
      emptyText="What you sell, with its price and picture. A line on a document starts from here, then you can change it there."
      onSave={saveProduct}
      onDelete={deleteProduct}
      summary={(p) => (
        <div className="flex items-center gap-3">
          {p.image ? (
            <img src={p.image.dataUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-contain" />
          ) : (
            <span className="h-10 w-10 shrink-0 rounded-md bg-slate-100 dark:bg-slate-800" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-medium text-slate-900 dark:text-slate-100">{p.code || 'No code'}</div>
            <div className="truncate text-sm text-slate-500 dark:text-slate-400">{p.description.split('\n')[0]}</div>
          </div>
          <div className="tabular text-right text-sm">
            {p.listPrice !== undefined && p.listPrice > p.unitPrice && (
              <div className="text-slate-400 line-through">{formatMoney(p.listPrice, currency, style, true)}</div>
            )}
            <div className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(p.unitPrice, currency, style, true)}</div>
            {p.unit && <div className="text-xs italic text-slate-500">{p.unit}</div>}
          </div>
        </div>
      )}
      form={(p, set) => (
        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="row-span-2">
            <ImagePicker value={p.image} onChange={(image) => set({ image })} maxEdge={240} label="picture" />
          </div>
          <Field label="Code">
            <input className={inputCls} value={p.code} onChange={(e) => set({ code: e.target.value })} autoFocus />
          </Field>
          <Field label="Description" className="sm:col-start-2">
            <textarea className={`${inputCls} resize-y`} rows={3} value={p.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-4">
            <Field label="Unit">
              <input className={inputCls} value={p.unit} placeholder="unité, day…" onChange={(e) => set({ unit: e.target.value })} />
            </Field>
            <Field label="Price">
              <MoneyInput value={p.unitPrice} onChange={(v) => set({ unitPrice: v ?? 0 })} style={style} />
            </Field>
            <Field label="List price" hint="Optional; struck through when higher.">
              <MoneyInput value={p.listPrice} onChange={(listPrice) => set({ listPrice })} style={style} placeholder="—" />
            </Field>
            <Field label="VAT %">
              <DecimalInput value={p.taxRate} onChange={(taxRate) => set({ taxRate })} placeholder="—" />
            </Field>
          </div>
        </div>
      )}
    />
  );
}
