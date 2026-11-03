import { useEffect, useMemo, useRef, useState } from 'react';
import { useScrollHint } from '@unisim/sdk';
import { journeyOf, nextStep, sourceFor, startOf, stepsOf, type Step } from '../lib/journey';
import { KIND_NAMES, KIND_ORDER, kindPlural, type BusinessDocKind, type InvoiceDoc } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import { fileSize, openAttachment, readAttachment } from './attachments';
import { btnGhost, btnPrimary, confirmAction, sectionTitle } from './ui';

const STATE_TEXT = { uploaded: 'Uploaded', done: 'Done elsewhere', skipped: 'Not needed', todo: 'To do' } as const;

/** Making the next step from an imported document nobody has checked yet asks first. */
export function confirmMakeFrom(doc: InvoiceDoc): boolean {
  if (!doc.imported || doc.imported.checked) return true;
  return confirmAction(
    `${doc.number} was read from a PDF and its amounts have not been checked yet. Anything made from it copies them. Make it anyway?`,
  );
}

/**
 * The journey (lib/journey.ts): estimate → quote → proforma → invoice →
 * delivery note, each made here, uploaded, done elsewhere or not needed. A
 * row of steps, then what can be done with the one picked — on a phone the
 * row scrolls sideways, cut off at the edge (the suite rule).
 */
export default function DocumentJourney({ doc }: { doc: InvoiceDoc }) {
  const { documents, convert, open, markStep } = useAppStore();
  const journey = useMemo(() => journeyOf(doc, documents), [doc, documents]);
  const steps = useMemo(() => stepsOf(journey), [journey]);
  const start = Math.min(startOf(steps), KIND_ORDER.indexOf(doc.kind));
  const [earlier, setEarlier] = useState(false);
  const [picked, setPicked] = useState<BusinessDocKind>(() => nextStep(steps, doc.kind));
  const [error, setError] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const hint = useScrollHint<HTMLOListElement>();
  const row = useRef<HTMLOListElement | null>(null);

  // The picked step in view: on a phone the row is wider than the screen.
  useEffect(() => {
    row.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [picked]);

  const shown = steps.filter((_, i) => earlier || i >= start);
  const step = steps.find((s) => s.kind === picked) ?? steps[0];
  const done = shown.filter((s) => s.state !== 'todo').length;
  const uploaded = step.state === 'uploaded' && step.mark?.state === 'uploaded' ? step.mark.file : undefined;

  // "Make the invoice here" asks first: based on the step before, or fresh.
  const [asking, setAsking] = useState(false);
  const source = sourceFor(steps, step.kind, doc);
  const make = (fresh: boolean) => {
    setAsking(false);
    if (fresh || confirmMakeFrom(source)) void convert(source.id, step.kind, fresh);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* "Project", not "Journey" (James, 2026-11-03); the code keeps journey. */}
        <h2 className={sectionTitle}>Project</h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {done} of {shown.length} steps done
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
        {shown.map((s, i) => (
          <li key={s.kind} className="flex shrink-0 items-center gap-1">
            {i > 0 && <span aria-hidden className={`h-px w-4 ${s.state === 'todo' ? 'bg-slate-300 dark:bg-slate-700' : 'bg-orange-500'}`} />}
            <button
              type="button"
              aria-pressed={picked === s.kind}
              // A step made here opens its document (James, 2026-11-03: "when
              // clicking a step change to that document, no need for the link
              // below"); the others show what can be done with them.
              title={s.state === 'made' && s.kind !== doc.kind ? `Open ${s.docs[s.docs.length - 1].number}` : undefined}
              onClick={() => {
                if (s.state === 'made' && s.kind !== doc.kind) {
                  open(s.docs[s.docs.length - 1].id);
                  return;
                }
                setPicked(s.kind);
                setError(null);
                setAsking(false);
              }}
              className={`flex min-w-[7.5rem] items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                picked === s.kind
                  ? 'border-orange-500 bg-orange-50 dark:border-orange-500 dark:bg-orange-950/40'
                  : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
              }`}
            >
              <StepDot step={s} current={s.kind === doc.kind} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{KIND_NAMES[s.kind]}</span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                  {s.state === 'made' ? (s.kind === doc.kind ? 'This one' : s.docs[s.docs.length - 1].number) : STATE_TEXT[s.state]}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {/* Outside the row below, so a row with nothing to say (a step made here) takes no room. */}
      <input
        ref={upload}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            markStep(journey.root.id, step.kind, { state: 'uploaded', file: await readAttachment(f), at: Date.now() });
            setError(null);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      />
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
          </>
        )}
        {(step.state === 'done' || step.state === 'skipped' || step.state === 'uploaded') && (
          <button type="button" className={btnGhost} onClick={() => markStep(journey.root.id, step.kind, null)}>
            {step.state === 'uploaded' ? 'Remove' : 'Undo'}
          </button>
        )}

        {step.state === 'todo' && asking && (
          <div className="w-full space-y-2 rounded-xl border border-orange-200 bg-orange-50/60 p-3 dark:border-orange-900/60 dark:bg-orange-950/20">
            <p className="font-medium text-slate-900 dark:text-slate-100">Make the {KIND_NAMES[step.kind].toLowerCase()}:</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={() => make(false)} autoFocus>
                Based on {KIND_NAMES[source.kind].toLowerCase()} {source.number}
              </button>
              <button type="button" className={btnGhost} onClick={() => make(true)}>
                Start fresh
              </button>
              <button type="button" className={btnGhost} onClick={() => setAsking(false)}>
                Cancel
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Based on it copies the lines, prices, discounts, notes and terms. Starting fresh keeps only the client. Either way it joins this project.
            </p>
          </div>
        )}
        {step.state === 'todo' && !asking && (
          <>
            <button type="button" className={btnPrimary} onClick={() => setAsking(true)}>
              Make the {KIND_NAMES[step.kind].toLowerCase()} here
            </button>
            <button type="button" className={btnGhost} onClick={() => upload.current?.click()}>
              Upload a copy…
            </button>
            <button type="button" className={btnGhost} onClick={() => markStep(journey.root.id, step.kind, { state: 'done', at: Date.now() })}>
              Done elsewhere
            </button>
            <button type="button" className={btnGhost} onClick={() => markStep(journey.root.id, step.kind, { state: 'skipped', at: Date.now() })}>
              Not needed
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </section>
  );
}

function StepDot({ step, current }: { step: Step; current: boolean }) {
  const tone =
    step.state === 'todo'
      ? 'border-2 border-slate-300 dark:border-slate-600'
      : step.state === 'skipped'
        ? 'bg-slate-300 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
        : 'bg-orange-600 text-white';
  return (
    <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${tone} ${current ? 'ring-2 ring-orange-300 ring-offset-1 dark:ring-offset-slate-900' : ''}`}>
      {step.state === 'skipped' ? '–' : step.state === 'todo' ? '' : '✓'}
    </span>
  );
}
