import { useMemo, useState, type DragEvent } from 'react';
import { formatMoney } from '@unisim/doc';
import { arrange, flatten, step } from '../lib/arrange';
import { uid } from '../lib/convert';
import { codeFromFileName, isPicture, toStored } from '../lib/picture';
import type { Folder, NumberStyle, Product } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import ImagePicker from './ImagePicker';
import { saveSpreadsheet } from './exportSheet';
import RecordList, { type TreeNode } from './RecordList';
import { DecimalInput, Field, MoneyInput, btnGhost, btnPrimary, card, confirmAction, inputCls } from './ui';

const PRODUCT_EDGE = 240;

const blankProduct = (): Product => ({ id: uid(), code: '', description: '', unit: '', unitPrice: 0, updatedAt: Date.now() });

/** Anything typed or dropped in — a row worth saving. */
const filled = (p: Product) => !!(p.code.trim() || p.description.trim() || p.image || p.unitPrice || p.unit.trim());

/** Pictures → new products, the file name (less its extension) as the code. */
async function productsFromPictures(files: File[]): Promise<{ made: Product[]; skipped: number }> {
  const made: Product[] = [];
  let skipped = 0;
  for (const f of files) {
    if (!isPicture(f)) {
      skipped++;
      continue;
    }
    try {
      made.push({ ...blankProduct(), code: codeFromFileName(f.name), image: await toStored(f, PRODUCT_EDGE) });
    } catch {
      skipped++;
    }
  }
  return { made, skipped };
}

const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');

/**
 * Add many at once (James, 2026-10-30: "when start typing in one, add another
 * product box beneath in case they want to do many"). Rows, not the full
 * form: the last row filling in adds a blank one under it, and Save keeps the
 * filled ones. Pictures dropped on the rows become rows of their own.
 */
function NewProducts({ style, onDone }: { style: NumberStyle; onDone: () => void }) {
  const addProducts = useAppStore((s) => s.addProducts);
  const [rows, setRows] = useState<Product[]>(() => [blankProduct()]);
  const [over, setOver] = useState(false);
  const ready = rows.filter(filled);

  const update = (id: string, patch: Partial<Product>) =>
    setRows((rs) => {
      const next = rs.map((r) => (r.id === id ? { ...r, ...patch } : r));
      // Typing in the last row: a fresh one beneath, ready for the next.
      return filled(next[next.length - 1]) ? [...next, blankProduct()] : next;
    });
  const remove = (id: string) =>
    setRows((rs) => {
      const next = rs.filter((r) => r.id !== id);
      return next.length && !filled(next[next.length - 1]) ? next : [...next, blankProduct()];
    });

  return (
    <div
      className={`${card} space-y-3 ring-2 ${over ? 'ring-orange-400' : 'ring-orange-200 dark:ring-orange-900'}`}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const { made } = await productsFromPictures([...e.dataTransfer.files]);
        // Into the rows, before the blank one at the end.
        setRows((rs) => [...rs.filter(filled), ...made, blankProduct()]);
      }}
    >
      <p className="text-sm text-slate-600 dark:text-slate-400">
        A new row appears as you type. Drop pictures here to make a row of each — the file name becomes the code.
      </p>
      <div className="hidden grid-cols-[2.5rem_8rem_minmax(0,1fr)_6rem_8rem_4.5rem_2rem] gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid dark:text-slate-400">
        <span />
        <span>Code</span>
        <span>Description</span>
        <span>Unit</span>
        <span>Price</span>
        <span>VAT %</span>
        <span />
      </div>
      {rows.map((p, i) => (
        <div
          key={p.id}
          className="grid grid-cols-[2.5rem_minmax(0,1fr)_2rem] items-center gap-2 border-t border-slate-100 pt-3 first-of-type:border-0 sm:grid-cols-[2.5rem_8rem_minmax(0,1fr)_6rem_8rem_4.5rem_2rem] sm:border-0 sm:pt-0 dark:border-slate-800"
          data-testid="new-product-row"
        >
          <ImagePicker compact value={p.image} onChange={(image) => update(p.id, { image })} maxEdge={PRODUCT_EDGE} label="picture" />
          <input className={inputCls} value={p.code} placeholder="Code" aria-label="Code" onChange={(e) => update(p.id, { code: e.target.value })} autoFocus={i === 0} />
          <button
            type="button"
            className="h-8 w-8 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:order-last dark:hover:bg-slate-800"
            aria-label="Remove this row"
            title="Remove this row"
            onClick={() => remove(p.id)}
          >
            ✕
          </button>
          <input
            className={`${inputCls} col-span-3 sm:col-span-1`}
            value={p.description}
            placeholder="Description"
            aria-label="Description"
            onChange={(e) => update(p.id, { description: e.target.value })}
          />
          {/* Their own row on a phone; the table's columns from sm up (`contents`). */}
          <div className="col-span-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-2 sm:contents">
            <input className={inputCls} value={p.unit} placeholder="Unit" aria-label="Unit" onChange={(e) => update(p.id, { unit: e.target.value })} />
            <MoneyInput value={p.unitPrice || undefined} onChange={(v) => update(p.id, { unitPrice: v ?? 0 })} style={style} placeholder="Price" ariaLabel="Price" />
            <DecimalInput value={p.taxRate} onChange={(taxRate) => update(p.id, { taxRate })} placeholder="VAT %" ariaLabel="VAT %" />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className={btnPrimary}
          disabled={!ready.length}
          onClick={async () => {
            await addProducts(ready);
            onDone();
          }}
        >
          {ready.length > 1 ? `Save ${ready.length} products` : 'Save'}
        </button>
        <button type="button" className={btnGhost} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** A folder's heading: its name (click to rename), how many it holds, Delete. */
function FolderTitle({ folder, count, fresh, onRenamed }: { folder: Folder; count: number; fresh: boolean; onRenamed: () => void }) {
  const { saveFolder, deleteFolder } = useAppStore();
  const [name, setName] = useState<string | null>(fresh ? folder.name : null);
  const done = async () => {
    const next = name?.trim();
    setName(null);
    onRenamed();
    if (next && next !== folder.name) await saveFolder({ ...folder, name: next });
  };
  return (
    <div className="flex items-center gap-2">
      {name !== null ? (
        <input
          className={`${inputCls} max-w-xs py-1`}
          value={name}
          aria-label="Folder name"
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void done()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void done();
            if (e.key === 'Escape') {
              setName(null);
              onRenamed();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="min-w-0 truncate rounded-md px-1 text-left font-semibold text-slate-900 hover:bg-slate-200 dark:text-slate-100 dark:hover:bg-slate-800"
          title="Rename this folder"
          onClick={() => setName(folder.name)}
        >
          {folder.name}
        </button>
      )}
      <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">{count}</span>
      <button
        type="button"
        className="ml-auto shrink-0 rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950 dark:hover:text-red-400"
        onClick={async () => {
          const what = count ? ` Its ${count} product${count === 1 ? '' : 's'} move out of it — none is deleted.` : '';
          if (confirmAction(`Delete the folder “${folder.name}”?${what}`)) await deleteFolder(folder.id);
        }}
      >
        Delete folder
      </button>
    </div>
  );
}

export default function CatalogueView() {
  const { products, folders, companies, saveProduct, deleteMany, loadExample, duplicateRow, addProducts, saveFolder, moveInCatalogue } = useAppStore();
  const [adding, setAdding] = useState(false);
  /** The folder just made: its name opens for typing. */
  const [fresh, setFresh] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Prices are typed in the first company's number style — the one you work in.
  const style: NumberStyle = companies[0]?.defaults.numberStyle ?? 'en';
  const currency = companies[0]?.defaults.currency ?? 'EUR';
  // Folders and products in the order they were dragged into (lib/arrange.ts).
  const entries = useMemo(() => arrange(products, folders), [products, folders]);
  const sorted = useMemo(() => flatten(entries), [entries]);
  const tree = useMemo(
    () => entries.map((e): TreeNode<Product> => (e.kind === 'folder' ? { kind: 'folder', id: e.folder.id, rows: e.items } : { kind: 'row', row: e.product })),
    [entries],
  );

  const newFolder = async () => {
    // At the top, above everything, so it is in view.
    const first = entries[0];
    const top = first ? ((first.kind === 'folder' ? first.folder.order : first.product.order) ?? 0) : 0;
    const folder: Folder = { id: uid(), name: 'New folder', order: Math.min(0, top) - 1, updatedAt: Date.now() };
    // Before it is saved: its heading reads `fresh` once, when it first appears.
    setFresh(folder.id);
    await saveFolder(folder);
  };

  /** Pictures dropped on the tab, not on a product: one new product each. */
  const dropPictures = async (files: File[]) => {
    const { made, skipped } = await productsFromPictures(files);
    if (made.length) await addProducts(made);
    setNotice(
      [
        made.length ? `Added ${made.length} product${made.length === 1 ? '' : 's'} from pictures, each coded by its file name — open one to add its price.` : '',
        skipped ? `${skipped} file${skipped === 1 ? ' was' : 's were'} not a picture this can use (PNG, JPEG, WebP or GIF).` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  };

  return (
    <div
      className="relative space-y-3"
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        void dropPictures([...e.dataTransfer.files]);
      }}
    >
      {over && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-2xl border-2 border-dashed border-orange-400 bg-orange-50/80 pt-24 text-sm font-semibold text-orange-900 dark:bg-orange-950/60 dark:text-orange-200">
          Drop pictures to make a product of each — the file name becomes its code. Drop on a product to change its picture.
        </div>
      )}
      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-200">
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)} className="font-semibold" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      <RecordList<Product>
        rows={sorted}
        tree={tree}
        onMove={(ids, target) => void moveInCatalogue(ids, target)}
        onStep={(id, dir) => {
          const target = step(products, folders, id, dir);
          if (target) void moveInCatalogue(id, target);
        }}
        folderHead={(id, count) => {
          const folder = folders.find((f) => f.id === id);
          return folder && <FolderTitle folder={folder} count={count} fresh={fresh === id} onRenamed={() => setFresh(null)} />;
        }}
        toolbar={
          <button type="button" className={btnGhost} disabled={adding} onClick={() => void newFolder()}>
            New folder
          </button>
        }
        noun="product"
        make={blankProduct}
        emptyText="What you sell, with its price and picture. A line on a document starts from here, then you can change it there. Drop pictures here to make a product of each."
        onSave={saveProduct}
        onDelete={(ids) => deleteMany('products', ids)}
        onExample={() => void loadExample('products')}
        onExport={(ids) => saveSpreadsheet('products', ids)}
        onDuplicate={(p) => duplicateRow('products', p.id)}
        onAdd={() => setAdding(true)}
        adding={adding ? <NewProducts style={style} onDone={() => setAdding(false)} /> : undefined}
        onDropFiles={async (p, files) => {
          const file = files.find(isPicture);
          if (!file) return;
          try {
            await saveProduct({ ...p, image: await toStored(file, PRODUCT_EDGE) });
          } catch {
            setNotice('That picture could not be read. Try a PNG or JPEG.');
          }
        }}
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
              <ImagePicker value={p.image} onChange={(image) => set({ image })} maxEdge={PRODUCT_EDGE} label="picture" />
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
    </div>
  );
}
