import { useId, useMemo, useState } from 'react';
import { useDefaultView, useScrollHint } from '@unisim/sdk';
import { computeTotals, formatDate, formatMoney, wantsDecimals } from '@unisim/doc';
import { groupByJourney } from '../lib/journey';
import { DOCUMENTS_VIEWS, DOCUMENTS_VIEW_VALUES, type DocumentsView as DocumentsViewKind } from '../lib/tabs';
import { KIND_NAMES, kindPlural, type InvoiceDoc } from '../lib/types';
import { ownCompanies, useAppStore } from '../stores/appStore';
import { useActiveCompany } from './activeCompany';
import CompanySwitcher from './CompanySwitcher';
import ImportPdfButton from './ImportPdfButton';
import NewDocumentButton from './NewDocumentButton';
import { saveSpreadsheet } from './exportSheet';
import { SelectCheckbox, SelectionBar, useSelection, type Selection } from './selection';
import { EmptyState, ExampleChip, btnGhost, exampleBorder, inputCls } from './ui';


function total(doc: InvoiceDoc): string {
  if (doc.kind === 'delivery-note') return '—';
  const t = computeTotals(doc);
  return formatMoney(t.gross, doc.currency, doc.numberStyle, wantsDecimals({ ...doc, decimals: undefined }));
}

/**
 * One document in the list. On its own it shows its client; in a journey the
 * journey's header does that, so it shows its number — and its columns are
 * pulled in by the extra indent, so date and total still line up.
 */
function DocRow({ d, sel, open, inJourney }: { d: InvoiceDoc; sel: Selection; open: (id: string) => void; inJourney?: boolean }) {
  return (
    <li className={`flex items-center ${d.example ? `border-2 ${exampleBorder}` : ''}`}>
      <div className={`flex items-center self-stretch ${inJourney ? 'pl-8' : 'pl-4'}`}>
        <SelectCheckbox checked={sel.has(d.id)} onChange={() => sel.toggle(d.id)} label={`Select ${d.number}`} />
      </div>
      <button
        type="button"
        onClick={() => open(d.id)}
        className={`grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 text-left hover:bg-orange-50/60 dark:hover:bg-slate-800/60 ${
          inJourney ? 'py-2 sm:grid-cols-[7rem_minmax(0,1fr)_6rem_7rem]' : 'py-3 sm:grid-cols-[8rem_minmax(0,1fr)_6rem_7rem]'
        }`}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">{KIND_NAMES[d.kind]}</span>
        {/* On a phone: kind and date, then the client across, then the total. */}
        <span className="justify-self-end text-sm text-slate-600 sm:order-3 sm:justify-self-auto dark:text-slate-400">{formatDate(d.date)}</span>
        {inJourney ? (
          // On a phone the number and total share a line: the header has the client.
          <span className="min-w-0 truncate text-sm text-slate-700 sm:order-2 dark:text-slate-300">{d.number}</span>
        ) : (
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
        )}
        <span className={`tabular text-right text-sm font-semibold text-slate-900 sm:order-4 sm:col-span-1 dark:text-slate-100 ${inJourney ? '' : 'col-span-2'}`}>{total(d)}</span>
      </button>
    </li>
  );
}

/**
 * Documents made from each other, together (Documents ▸ All): the client and
 * subject once, with a tick box for the lot, then its documents. Folded, it
 * shows only its newest (James, 2026-11-03: "make any projects collapsible
 * and just show their latest document"); unfolded, all of them in project
 * order. Its newest document's subject wins — the latest word on the job.
 */
function JourneyGroup({ docs, sel, open, folded, onToggle }: { docs: InvoiceDoc[]; sel: Selection; open: (id: string) => void; folded: boolean; onToggle: () => void }) {
  const newest = docs.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  const all = docs.every((d) => sel.has(d.id));
  const body = useId();
  return (
    <li className="bg-slate-50/70 pb-1 dark:bg-slate-950/30">
      <div className="flex items-center">
        <div className="flex items-center self-stretch pl-4">
          <SelectCheckbox
            checked={all}
            onChange={() => docs.filter((d) => sel.has(d.id) === all).forEach((d) => sel.toggle(d.id))}
            label={`Select the ${docs.length} documents for ${newest.client.name || 'this client'}`}
          />
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!folded}
          aria-controls={body}
          className="flex min-w-0 flex-1 items-baseline justify-between gap-3 px-4 pb-1 pt-3 text-left"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium text-slate-900 dark:text-slate-100">{newest.client.name || 'No client yet'}</span>
              {newest.example && <ExampleChip />}
            </span>
            {newest.subject && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{newest.subject}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
            {folded ? `Project · show all ${docs.length}` : `Project · ${docs.length} documents`}
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={`transition-transform ${folded ? '-rotate-90' : ''}`}>
              <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </div>
      <ul id={body}>
        {(folded ? [newest] : docs).map((d) => (
          <DocRow key={d.id} d={d} sel={sel} open={open} inJourney />
        ))}
      </ul>
    </li>
  );
}

export default function DocumentsView() {
  const { companies, documents, createDocument, open, setTab, loadExample, deleteMany, duplicate } = useAppStore();
  // The sidebar's kind. A double tap makes it what Documents opens on.
  const shows = useDefaultView<DocumentsViewKind>('documents-kind', 'all', { views: DOCUMENTS_VIEW_VALUES });
  const [kind, setKind] = useState<DocumentsViewKind>(shows.defaultView);
  const [query, setQuery] = useState('');
  // Projects open by hand, by their first document. The rest are folded to their newest.
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const toggleProject = (id: string) =>
    setUnfolded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const mine = ownCompanies(companies);
  // One company's documents at a time (James, 2026-11-03: "show a dropdown of
  // the available companies and in the list only show the documents from
  // that company, don't put them all together"). It is the active company —
  // the one new documents come from, as in Your companies.
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
  // All lists by journey; one kind is a plain list (a journey has one of each, mostly).
  const groups = useMemo(() => (kind === 'all' ? groupByJourney(rows, documents) : rows.map((d) => [d])), [kind, rows, documents]);

  // "New …" is always here. With no company of your own yet, it opens the
  // company form first (the store's companyPrompt) and the document after.
  const newButton = (
    <>
      <NewDocumentButton kind={kind} onNew={(k) => void createDocument(k, fromCompany?.id)} />
      <ImportPdfButton kind={kind} companyId={fromCompany?.id} />
    </>
  );
  // The active company by its logo; a click lists them all, with theirs
  // (James, 2026-11-04). Picking one there is Your companies' "Make active".
  const from = fromCompany && (
    <CompanySwitcher
      companies={mine}
      active={fromCompany}
      others={showOthers}
      orphans={orphans}
      onPick={(id) => {
        setOthers(false);
        setActive(id);
      }}
      onOthers={() => setOthers(true)}
      onManage={() => setTab('companies')}
    />
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
            ? 'Start with an estimate or a quote from New document — or Import PDF to bring in one made elsewhere. Each document shows its project, from estimate to delivery note.'
            : 'Your company’s name, address, logo and bank details go on every document — the first new document asks for them. Everything stays in this browser; sign in, and your company’s details come with you.'}
        </EmptyState>
      </div>
    );
  }

  return (
    // The kinds are a sidebar beside the list from md up, and a sideways row of
    // chips above it on a phone (cut off at the edge, with a fade, so it reads
    // as a row that scrolls — the suite rule).
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-6">
      <nav
        ref={hint.ref}
        aria-label="Kinds of document"
        style={hint.style}
        className={`u-tabs ${hint.className} md:flex-col md:self-start md:overflow-visible`}
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
              className="u-tab justify-between gap-3"
            >
              <span className="whitespace-nowrap">{v.label}</span>
              <span className={`tabular text-xs ${on ? '' : 'opacity-75'}`}>{counts[v.value] ?? 0}</span>
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
            {groups.map((g) =>
              g.length > 1 ? (
                // A search shows every match, so its projects are open.
                <JourneyGroup key={g[0].id} docs={g} sel={sel} open={open} folded={!query.trim() && !unfolded.has(g[0].id)} onToggle={() => toggleProject(g[0].id)} />
              ) : (
                <DocRow key={g[0].id} d={g[0]} sel={sel} open={open} />
              ),
            )}
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
