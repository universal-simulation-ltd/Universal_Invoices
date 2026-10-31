import { useMemo, useState } from 'react';
import { computeTotals, formatDate, formatMoney, wantsDecimals } from '@unisim/doc';
import { KIND_NAMES, KIND_ORDER, STATUS_NAMES, type BusinessDocKind, type DocStatus, type InvoiceDoc } from '../lib/types';
import { ownCompanies, useAppStore } from '../stores/appStore';
import { useActiveCompany } from './activeCompany';
import { saveSpreadsheet } from './exportSheet';
import { SelectCheckbox, SelectionBar, useSelection } from './selection';
import { EmptyState, ExampleChip, btnGhost, btnPrimary, exampleBorder, inputCls, selectBase } from './ui';

const STATUS_TONE: Record<DocStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  sent: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  accepted: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  declined: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300',
  paid: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  cancelled: 'bg-slate-100 text-slate-500 line-through dark:bg-slate-800 dark:text-slate-500',
};

function total(doc: InvoiceDoc): string {
  if (doc.kind === 'delivery-note') return '—';
  const t = computeTotals(doc);
  return formatMoney(t.gross, doc.currency, doc.numberStyle, wantsDecimals({ ...doc, decimals: undefined }));
}

export default function DocumentsView() {
  const { companies, documents, createDocument, open, loadExample, deleteMany, setTab } = useAppStore();
  const [kind, setKind] = useState<BusinessDocKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const mine = ownCompanies(companies);
  // New documents come from the active company, chosen in Your companies.
  const { active: fromCompany } = useActiveCompany();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents
      .filter((d) => kind === 'all' || d.kind === kind)
      .filter((d) => !q || [d.number, d.client.name, d.subject].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)));
  }, [documents, kind, query]);
  const sel = useSelection(rows.map((d) => d.id));

  return (
    <div className="space-y-4">

      {/* "New …" is always here. With no company of your own yet, it opens the
          company form first (the store's companyPrompt) and the document after. */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} onClick={() => void createDocument('quote', fromCompany?.id)}>
          New quote
        </button>
        {KIND_ORDER.filter((k) => k !== 'quote').map((k) => (
          <button key={k} type="button" className={btnGhost} onClick={() => void createDocument(k, fromCompany?.id)}>
            New {KIND_NAMES[k].toLowerCase()}
          </button>
        ))}
        {mine.length > 1 && fromCompany && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            From <span className="font-medium text-slate-700 dark:text-slate-200">{fromCompany.name}</span> ·{' '}
            <button type="button" className="font-medium text-orange-700 hover:underline dark:text-orange-400" onClick={() => setTab('companies')}>
              change
            </button>
          </p>
        )}
      </div>

      {documents.length === 0 ? (
        // The example lives here, not in the menu (James, 2026-10-30): offered
        // while nothing is saved, gone once there is something of your own.
        <EmptyState
          title="No documents yet"
          action={
            <button type="button" className={btnGhost} onClick={() => void loadExample('documents')}>
              See an example
            </button>
          }
        >
          {mine.length
            ? 'Make a quote above. When it is accepted, “Make… → Invoice from this” carries everything across.'
            : 'Your company’s name, address, logo and bank details go on every document — the first “New …” asks for them. Everything stays in this browser; sign in, and your company’s details come with you.'}
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${inputCls} max-w-xs`} placeholder="Search number, client, subject" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
            <select className={selectBase} value={kind} onChange={(e) => setKind(e.target.value as BusinessDocKind | 'all')} aria-label="Show">
              <option value="all">All kinds</option>
              {KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {KIND_NAMES[k]}s
                </option>
              ))}
            </select>
            <div className="ml-auto">
              <SelectionBar sel={sel} total={rows.length} noun="document" onDelete={(ids) => deleteMany('documents', ids)} onExport={(ids) => saveSpreadsheet('documents', ids)} />
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((d) => (
                <li key={d.id} className={`flex items-center ${d.example ? `border-2 ${exampleBorder}` : ''}`}>
                  <div className="flex items-center self-stretch pl-4">
                    <SelectCheckbox checked={sel.has(d.id)} onChange={() => sel.toggle(d.id)} label={`Select ${d.number}`} />
                  </div>
                  <button
                    type="button"
                    onClick={() => open(d.id)}
                    className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-orange-50/60 sm:grid-cols-[8rem_minmax(0,1fr)_6rem_7rem_auto] dark:hover:bg-slate-800/60"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">{KIND_NAMES[d.kind]}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-slate-900 dark:text-slate-100">{d.client.name || 'No client yet'}</span>
                        {d.example && <ExampleChip />}
                      </span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {d.number}
                        {d.subject ? ` · ${d.subject}` : ''}
                      </span>
                    </span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">{formatDate(d.date)}</span>
                    <span className="tabular text-right text-sm font-semibold text-slate-900 dark:text-slate-100">{total(d)}</span>
                    <span className={`justify-self-end rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[d.status]}`}>{STATUS_NAMES[d.status]}</span>
                  </button>
                </li>
              ))}
              {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Nothing matches.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
