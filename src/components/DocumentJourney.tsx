import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useScrollHint } from '@unisim/sdk';
import { copySource, journeyOf, passedBy, sourceFor, startOf, stepsOf, type Step } from '../lib/journey';
import { KIND_NAMES, KIND_ORDER, kindPlural, type BusinessDocKind, type InvoiceDoc } from '../lib/types';
import { useShownKinds } from './shownKinds';
import { useAppStore } from '../stores/appStore';
import { fileSize, openAttachment, readAttachment } from './attachments';
import { btnGhost, btnPrimary, confirmAction, sectionTitle, selectBase } from './ui';

/** Copying details from an imported document nobody has checked yet asks first. */
export function confirmMakeFrom(doc: InvoiceDoc): boolean {
  if (!doc.imported || doc.imported.checked) return true;
  return confirmAction(
    `${doc.number} was read from a PDF and its amounts have not been checked yet. Copying from it copies them. Copy anyway?`,
  );
}

/**
 * A step's document made elsewhere, uploaded into the project (Advanced
 * options — James, 2026-11-16: "move … the upload document … there"). Any step
 * without a document made here can take one; it shows on the project as that
 * step, with the file a tap away.
 */
export function UploadStep({ doc }: { doc: InvoiceDoc }) {
  const { documents, markStep } = useAppStore();
  const journey = useMemo(() => journeyOf(doc, documents), [doc, documents]);
  const { hideInvoices } = useShownKinds();
  const open = stepsOf(journey).filter((s) => s.state !== 'made' && s.state !== 'uploaded' && !(hideInvoices && s.kind === 'invoice'));
  const at = KIND_ORDER.indexOf(doc.kind);
  const [kind, setKind] = useState<BusinessDocKind | undefined>(() => (open.find((s) => KIND_ORDER.indexOf(s.kind) > at) ?? open[0])?.kind);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const picked = open.find((s) => s.kind === kind)?.kind ?? open[0]?.kind;
  if (!picked) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Upload a document made elsewhere</p>
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${selectBase} w-auto`} value={picked} onChange={(e) => setKind(e.target.value as BusinessDocKind)} aria-label="Which step it is">
          {open.map((s) => (
            <option key={s.kind} value={s.kind}>
              {KIND_NAMES[s.kind]}
            </option>
          ))}
        </select>
        <button type="button" className={btnGhost} onClick={() => input.current?.click()}>
          Upload…
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">A PDF or a picture. It goes on the project as that step, and opens from there.</p>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            markStep(journey.root.id, picked, { state: 'uploaded', file: await readAttachment(f), at: Date.now() });
            setError(null);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      />
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

/** A step with nothing in it: not made, ticked or uploaded (an old "not needed" mark is nothing too). */
const isEmpty = (s: Step) => s.state === 'todo' || s.state === 'skipped';

/**
 * The project (lib/journey.ts): estimate → quote → proforma → invoice →
 * delivery note. A step made here opens its document; one still to do opens a
 * new, empty document of its kind straight away, which offers to copy the
 * details from the last one (James, 2026-11-16: "no need for 'make X here'").
 * Its dotted tick ticks it as done elsewhere, and a step left blank before a
 * later one is greyed until it is filled in — no "Done elsewhere" or "Not
 * needed" buttons. On a phone the row scrolls sideways, cut off at the edge
 * (the suite rule).
 */
export default function DocumentJourney({ doc, versions }: { doc: InvoiceDoc; /** The open document's Versions, at the foot of the card. */ versions?: ReactNode }) {
  const { documents, convert, open, markStep, copyDetailsFrom } = useAppStore();
  const journey = useMemo(() => journeyOf(doc, documents), [doc, documents]);
  // Hidden in Tune this app, the invoice step goes unless this project already has one, or a mark on it.
  const { hideInvoices } = useShownKinds();
  const steps = useMemo(() => stepsOf(journey).filter((s) => !(hideInvoices && s.kind === 'invoice' && isEmpty(s))), [journey, hideInvoices]);
  const start = Math.min(startOf(steps), Math.max(0, steps.findIndex((s) => s.kind === doc.kind)));
  const [earlier, setEarlier] = useState(false);
  const [picked, setPicked] = useState<BusinessDocKind>(doc.kind);
  const [error, setError] = useState<string | null>(null);
  const hint = useScrollHint<HTMLOListElement>();
  const row = useRef<HTMLOListElement | null>(null);

  // The picked step in view: on a phone the row is wider than the screen.
  useEffect(() => {
    row.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [picked]);

  const shown = steps.filter((_, i) => earlier || i >= start);
  const passed = new Set(steps.filter((_, i) => passedBy(steps, i)).map((s) => s.kind));
  const step = steps.find((s) => s.kind === picked) ?? steps[0];
  const counted = shown.filter((s) => !passed.has(s.kind));
  const done = counted.filter((s) => !isEmpty(s)).length;
  const uploaded = step.state === 'uploaded' && step.mark?.state === 'uploaded' ? step.mark.file : undefined;

  // An empty document in a project offers the last one's details.
  const from = doc.lines.length === 0 ? copySource(steps, doc, documents) : undefined;
  const offer = from && from.lines.length > 0 ? from : undefined;

  const tick = (s: Step) => {
    markStep(journey.root.id, s.kind, isEmpty(s) ? { state: 'done', at: Date.now() } : null);
    setError(null);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* "Project", not "Journey" (James, 2026-11-03); the code keeps journey. */}
        <h2 className={sectionTitle}>Project</h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {done} of {counted.length} steps done
          {start > 0 && (
            <>
              {' · '}
              <button type="button" className="font-medium text-orange-700 hover:underline dark:text-orange-400" onClick={() => setEarlier((e) => !e)}>
                {earlier ? 'Hide earlier steps' : 'Show earlier steps'}
              </button>
            </>
          )}
        </span>
      </div>

      <ol
        ref={(el) => {
          row.current = el;
          hint.ref(el);
        }}
        style={hint.style} className={`${hint.className} -mx-1 mt-3 flex items-stretch gap-1 overflow-x-auto px-1 pb-1`} aria-label="Steps">
        {shown.map((s, i) => {
          const name = KIND_NAMES[s.kind];
          const grey = passed.has(s.kind);
          return (
            <li key={s.kind} className="flex shrink-0 items-center gap-1">
              {i > 0 && <span aria-hidden className={`h-px w-4 ${isEmpty(s) ? 'bg-slate-300 dark:bg-slate-700' : 'bg-orange-500'}`} />}
              <div
                className={`flex h-full min-w-[7.5rem] items-center rounded-xl border pl-2 transition-colors ${grey ? 'opacity-50 hover:opacity-100' : ''} ${
                  picked === s.kind
                    ? 'border-orange-500 bg-orange-50 dark:border-orange-500 dark:bg-orange-950/40'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                {/* Ticked by hand: done elsewhere. A step made or uploaded is ticked by that. */}
                {isEmpty(s) || s.state === 'done' ? (
                  <button
                    type="button"
                    className="group -m-0.5 rounded-full p-0.5"
                    onClick={() => tick(s)}
                    aria-label={isEmpty(s) ? `Tick ${name} as done` : `Untick ${name}`}
                    title={isEmpty(s) ? `Tick: the ${name.toLowerCase()} was done elsewhere` : 'Untick'}
                  >
                    <StepDot step={s} current={s.kind === doc.kind} />
                  </button>
                ) : (
                  <StepDot step={s} current={s.kind === doc.kind} />
                )}
                <button
                  type="button"
                  aria-pressed={picked === s.kind}
                  // A step made here opens its document (James, 2026-11-03);
                  // one still to do — or only ticked — opens a new, empty one
                  // of its kind (2026-11-16); an uploaded one shows its file.
                  title={
                    s.state === 'made' && s.kind !== doc.kind
                      ? `Open ${s.docs[s.docs.length - 1].number}`
                      : s.state !== 'made' && s.state !== 'uploaded'
                        ? `Start the ${name.toLowerCase()}`
                        : undefined
                  }
                  onClick={() => {
                    setError(null);
                    if (s.state === 'made' && s.kind !== doc.kind) {
                      open(s.docs[s.docs.length - 1].id);
                      return;
                    }
                    if (s.state !== 'made' && s.state !== 'uploaded') {
                      void convert(sourceFor(steps, s.kind, doc).id, s.kind, true);
                      return;
                    }
                    setPicked(s.kind);
                  }}
                  className="min-w-0 flex-1 self-stretch py-2 pl-2 pr-3 text-left"
                >
                  <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    {s.state === 'made'
                      ? s.kind === doc.kind
                        ? 'This one'
                        : s.docs[s.docs.length - 1].number
                      : s.state === 'uploaded'
                        ? 'Uploaded'
                        : s.state === 'done'
                          ? 'Ticked'
                          : grey
                            ? 'Skipped'
                            : 'To do'}
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {offer && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-orange-200 bg-orange-50/60 p-3 text-sm dark:border-orange-900/60 dark:bg-orange-950/20">
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              if (confirmMakeFrom(offer)) copyDetailsFrom(doc.id, offer.id);
            }}
          >
            Copy details from {KIND_NAMES[offer.kind].toLowerCase()} {offer.number}
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">The lines, prices, discounts, notes and terms. This {KIND_NAMES[doc.kind].toLowerCase()} keeps its own number and dates.</span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700 empty:hidden dark:text-slate-300">
        {/* A step opens its newest document; any others of the kind are here. */}
        {step.state === 'made' && step.docs.length > 1 && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-slate-500 dark:text-slate-400">Other {kindPlural(step.kind).toLowerCase()} in this project:</span>
            {step.docs
              .filter((d) => d.id !== doc.id)
              .map((d) => (
                <button key={d.id} type="button" className="font-medium text-orange-700 underline dark:text-orange-400" onClick={() => open(d.id)}>
                  {d.number}
                </button>
              ))}
          </span>
        )}

        {uploaded && (
          <>
            <span className="min-w-0 truncate">
              {uploaded.name} <span className="text-slate-500">({fileSize(uploaded.size)})</span>
            </span>
            <button type="button" className={btnGhost} onClick={() => openAttachment(uploaded)}>
              Open
            </button>
            <button type="button" className={btnGhost} onClick={() => markStep(journey.root.id, step.kind, null)}>
              Remove
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {versions}
    </section>
  );
}

function StepDot({ step, current }: { step: Step; current: boolean }) {
  // Nothing in it: a dotted tick, filled in on hover, to tick by hand.
  const empty = step.state === 'todo' || step.state === 'skipped';
  const tone = empty
    ? 'border-2 border-dashed border-slate-300 text-slate-300 group-hover:border-orange-500 group-hover:text-orange-600 dark:border-slate-600 dark:text-slate-600'
    : 'bg-orange-600 text-white';
  return (
    <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${tone} ${current ? 'ring-2 ring-orange-300 ring-offset-1 dark:ring-offset-slate-900' : ''}`}>
      ✓
    </span>
  );
}
