import { useMemo, useState } from 'react';
import { useDefaultView, useScrollHint } from '@unisim/sdk';
import { computeTotals, formatDate, formatMoney, wantsDecimals } from '@unisim/doc';
import { DOCUMENTS_VIEWS, DOCUMENTS_VIEW_VALUES, type DocumentsView as DocumentsViewKind } from '../lib/tabs';
import { KIND_NAMES, kindPlural, type InvoiceDoc } from '../lib/types';
import { ownCompanies, useAppStore } from '../stores/appStore';
import { useActiveCompany } from './activeCompany';
import ImportPdfButton from './ImportPdfButton';
import NewDocumentButton from './NewDocumentButton';
import { saveSpreadsheet } from './exportSheet';
import { SelectCheckbox, SelectionBar, useSelection } from './selection';
import { EmptyState, ExampleChip, btnGhost, exampleBorder, inputCls, selectBase } from './ui';


function total(doc: InvoiceDoc): string {
  if (doc.kind === 'delivery-note') return '—';
  const t = computeTotals(doc);
  return formatMoney(t.gross, doc.currency, doc.numberStyle, wantsDecimals({ ...doc, decimals: undefined }));
}

const OTHERS = '__others';

export default function DocumentsView() {
  const { companies, documents, createDocument, open, loadExample, deleteMany, duplicate } = useAppStore();
  // The sidebar's kind. A double tap makes it what Documents opens on.
  const shows = useDefaultView<DocumentsViewKind>('documents-kind', 'all', { views: DOCUMENTS_VIEW_VALUES });
  const [kind, setKind] = useState<DocumentsViewKind>(shows.defaultView);
  const [query, setQuery] = useState('');
  const mine = ownCompanies(companies);
  // One company's documents at a time (James, 2026-11-03: "show a dropdown of
  // the available companies and in the list only show the documents from
  // that company, don't put them all together"). The dropdown IS the active
  // company — the one new documents come from, as in Your companies.
  const { active: fromCompany, setActive } = useActiveCompany();
  const hint = useScrollHint<HTMLElement>();
  // Documents whose company has been deleted get an entry of their own.
  const [others, setOthers] = useState(false);
  const orphan = (d: InvoiceDoc) => !d.example && !mine.some((c) => c.id === d.companyId);
  const orphans = documents.filter(orphan).length;
  const showOthers = others && orphans > 0;
  const scoped = useMemo(
    () => (mine.length === 0 ? documents : documents.filter((d) => d.example || (showOthers ? orphan(d) : d.companyId === fromCompany?.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `orphan` reads `mine`, which follows `companies`
    [documents, companies, fromCompany?.id, showOthers],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: scoped.length };
    for (const d of scoped) c[d.kind] = (c[d.kind] ?? 0) + 1;
    return c;
  }, [scoped]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((d) => kind === 'all' || d.kind === kind)
      .filter((d) => !q || [d.number, d.client.name, d.subject].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)));
  }, [scoped, kind, query]);
  const sel = useSelection(rows.map((d) => d.id));

  // "New …" is always here. With no company of your own yet, it opens the
  // company form first (the store's companyPrompt) and the document after.
  const newButton = (
    <>
      <NewDocumentButton kind={kind} onNew={(k) => void createDocument(k, fromCompany?.id)} />
      <ImportPdfButton kind={kind} companyId={fromCompany?.id} />
    </>
  );
  const from = (mine.length > 1 || orphans > 0) && fromCompany && (
    <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      Company
      <select
        className={selectBase}
        value={showOthers ? OTHERS : fromCompany.id}
        aria-label="Company"
        onChange={(e) => {
          const v = e.target.value;
          setOthers(v === OTHERS);
          if (v !== OTHERS) setActive(v);
        }}
      >
        {mine.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name || 'Unnamed company'}
          </option>
        ))}
        {orphans > 0 && <option value={OTHERS}>From deleted companies ({orphans})</option>}
      </select>
    </label>
  );

  if (documents.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {newButton}
          {from}
        </div>
        {/* The example lives here, not in the menu (James, 2026-10-30): offered
            while nothing is saved, gone once there is something of your own. */}
        <EmptyState
          title="No documents yet"
          action={
            <button type="button" className={btnGhost} onClick={() => void loadExample('documents')}>
              See an example
            </button>
          }
        >
          {mine.length
            ? 'Start with an estimate or a quote from New document — or Import PDF to bring in one made elsewhere. Each document shows its journey to the delivery note.'
            : 'Your company’s name, address, logo and bank details go on every document — the first new document asks for them. Everything stays in this browser; sign in, and your company’s details come with you.'}
        </EmptyState>
      </div>
    );
  }

  return (
    // The kinds are a sidebar beside the list from md up, and a sideways row of
    // chips above it on a phone (cut off at the edge, with a fade, so it reads
    // as a row that scrolls — the suite rule).
    <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-6">
      <nav
        ref={hint.ref}
        aria-label="Kinds of document"
        style={hint.style}
        className={`${hint.className} -mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:self-start md:overflow-visible md:px-0`}
      >
        {DOCUMENTS_VIEWS.map((v) => {
          const on = kind === v.value;
          return (
            <button
              key={v.value}
              type="button"
              {...shows.buttonProps(v.value, v.label)}
              onClick={() => {
                shows.tap(v.value);
                setKind(v.value);
              }}
              aria-current={on ? 'true' : undefined}
              className={`flex shrink-0 select-none items-center justify-between gap-3 rounded-full px-3 py-1.5 text-sm font-medium transition-colors md:rounded-lg md:py-2 data-[default-view=true]:ring-2 data-[default-view=true]:ring-orange-400 ${
                on
                  ? 'bg-orange-700 text-white md:bg-white md:text-slate-900 md:shadow-sm dark:md:bg-slate-900 dark:md:text-slate-100'
                  : 'bg-white text-slate-600 hover:text-slate-900 md:bg-transparent md:hover:bg-slate-200/70 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-100 dark:md:bg-transparent dark:md:hover:bg-slate-800/70'
              }`}
            >
              <span className="whitespace-nowrap">{v.label}</span>
              <span className={`tabular text-xs ${on ? 'opacity-80 md:text-orange-700 md:opacity-100 dark:md:text-orange-400' : 'text-slate-400 dark:text-slate-500'}`}>{counts[v.value] ?? 0}</span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {newButton}
          <input className={`${inputCls} order-last w-full sm:order-none sm:w-auto sm:max-w-xs sm:flex-1`} placeholder="Search number, client, subject" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
          {from}
          <div className="ml-auto">
            <SelectionBar
              sel={sel}
              total={rows.length}
              noun="document"
              onDelete={(ids) => deleteMany('documents', ids)}
              onExport={(ids) => saveSpreadsheet('documents', ids)}
              // A copy with a new number — what "Make… → A copy" was in the editor (James, 2026-11-03).
              onDuplicate={async (ids) => {
                for (const id of ids) await duplicate(id);
              }}
            />
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
                  className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-orange-50/60 sm:grid-cols-[8rem_minmax(0,1fr)_6rem_7rem] dark:hover:bg-slate-800/60"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">{KIND_NAMES[d.kind]}</span>
                  {/* On a phone: kind and date, then the client across, then the total. */}
                  <span className="justify-self-end text-sm text-slate-600 sm:order-3 sm:justify-self-auto dark:text-slate-400">{formatDate(d.date)}</span>
                  <span className="col-span-2 min-w-0 sm:order-2 sm:col-span-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-900 dark:text-slate-100">{d.client.name || 'No client yet'}</span>
                      {d.example && <ExampleChip />}
                    </span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {d.number}
                      {d.subject ? ` · ${d.subject}` : ''}
                    </span>
                  </span>
                  <span className="tabular col-span-2 text-right text-sm font-semibold text-slate-900 sm:order-4 sm:col-span-1 dark:text-slate-100">{total(d)}</span>
                </button>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-500">
                {query.trim()
                  ? 'Nothing matches.'
                  : `No ${kind === 'all' ? 'documents' : kindPlural(kind).toLowerCase()}${mine.length > 1 && fromCompany && !showOthers ? ` from ${fromCompany.name}` : ''} yet.`}
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
