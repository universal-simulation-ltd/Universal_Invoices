import { useMemo, useState } from 'react';
import { computeTotals, formatDate, formatMoney, wantsDecimals } from '@unisim/doc';
import { KIND_NAMES, KIND_ORDER, STATUS_NAMES, type BusinessDocKind, type DocStatus, type InvoiceDoc } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import { EmptyState, btnGhost, btnPrimary, inputCls, selectBase } from './ui';

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
  const { companies, documents, createDocument, open, loadExample, setTab } = useAppStore();
  const [kind, setKind] = useState<BusinessDocKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const fromCompany = companies.find((c) => c.id === companyId) ?? companies[0];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents
      .filter((d) => kind === 'all' || d.kind === kind)
      .filter((d) => !q || [d.number, d.client.name, d.subject].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)));
  }, [documents, kind, query]);

  if (!companies.length) {
    return (
      <EmptyState
        title="Start with your company"
        action={
          <>
            <button type="button" className={btnPrimary} onClick={() => setTab('companies')}>
              Add your company
            </button>
            <button type="button" className={btnGhost} onClick={() => void loadExample()}>
              Try the example
            </button>
          </>
        }
      >
        Its name, address, logo, bank details and legal footer go on every document. It stays in this browser — nothing is
        uploaded, and there is no account.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        {companies.length > 1 && (
          <select className={selectBase} value={fromCompany.id} onChange={(e) => setCompanyId(e.target.value)} aria-label="New documents from">
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                From {c.name}
              </option>
            ))}
          </select>
        )}
        <button type="button" className={btnPrimary} onClick={() => void createDocument('quote', fromCompany.id)}>
          New quote
        </button>
        {KIND_ORDER.filter((k) => k !== 'quote').map((k) => (
          <button key={k} type="button" className={btnGhost} onClick={() => void createDocument(k, fromCompany.id)}>
            New {KIND_NAMES[k].toLowerCase()}
          </button>
        ))}
      </div>

      {documents.length === 0 ? (
        <EmptyState title="No documents yet">Make a quote above. When it is accepted, “Make… → Invoice from this” carries everything across.</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <input className={`${inputCls} max-w-xs`} placeholder="Search number, client, subject" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
            <select className={selectBase} value={kind} onChange={(e) => setKind(e.target.value as BusinessDocKind | 'all')} aria-label="Show">
              <option value="all">All kinds</option>
              {KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {KIND_NAMES[k]}s
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => open(d.id)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-orange-50/60 sm:grid-cols-[8rem_minmax(0,1fr)_6rem_7rem_auto] dark:hover:bg-slate-800/60"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-orange-700 sm:order-none dark:text-orange-400">{KIND_NAMES[d.kind]}</span>
                    <span className="min-w-0 sm:order-none">
                      <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{d.client.name || 'No client yet'}</span>
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
