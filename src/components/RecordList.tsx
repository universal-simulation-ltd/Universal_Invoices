import { useEffect, useState, type ReactNode } from 'react';
import { SelectCheckbox, SelectionBar, useSelection } from './selection';
import { EmptyState, ExampleChip, btnDanger, btnGhost, btnPrimary, card, confirmAction, exampleBorder } from './ui';

/**
 * The shape the Clients, Catalogue and Companies tabs share: a list, one row
 * open for editing at a time, edited as a DRAFT and saved on Save — so a
 * half-typed address never reaches a document made in another tab meanwhile.
 * Every row can be ticked for "Delete selected" (the suite's list rule), and
 * the built-in example carries an Example chip and a dashed border.
 */
export default function RecordList<T extends { id: string; example?: boolean }>({
  rows,
  make,
  noun,
  emptyText,
  summary,
  form,
  onSave,
  onDelete,
  deleteWarning,
  onExample,
  startNew = false,
  onStarted,
}: {
  rows: T[];
  make: () => T;
  noun: string;
  emptyText: ReactNode;
  summary: (row: T) => ReactNode;
  form: (draft: T, set: (patch: Partial<T>) => void) => ReactNode;
  onSave: (row: T) => Promise<void>;
  onDelete: (ids: string[]) => Promise<void>;
  deleteWarning?: (row: T) => string;
  /** "See an example", offered while the list is empty. */
  onExample?: () => void;
  /** Open with a blank form ready (the "register your company first" prompt). */
  startNew?: boolean;
  onStarted?: () => void;
}) {
  const [draft, setDraft] = useState<T | null>(null);
  const isNew = draft !== null && !rows.some((r) => r.id === draft.id);
  const sel = useSelection(rows.map((r) => r.id));

  useEffect(() => {
    if (!startNew) return;
    setDraft(make());
    onStarted?.();
    // Once, when asked: `make` and `onStarted` are fresh closures every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startNew]);

  const editor = (d: T) => (
    <div className={`${card} ring-2 ring-orange-200 dark:ring-orange-900`}>
      {d.example && (
        <p className="mb-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <ExampleChip /> This is the example. It goes as soon as you add one of your own.
        </p>
      )}
      {form(d, (patch) => setDraft({ ...d, ...patch }))}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary}
          onClick={async () => {
            await onSave(d);
            setDraft(null);
          }}
        >
          Save
        </button>
        <button type="button" className={btnGhost} onClick={() => setDraft(null)}>
          Cancel
        </button>
        {!isNew && (
          <button
            type="button"
            className={`${btnDanger} ml-auto`}
            onClick={async () => {
              if (!confirmAction(deleteWarning?.(d) ?? `Delete this ${noun}? This cannot be undone.`)) return;
              await onDelete([d.id]);
              setDraft(null);
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className={btnPrimary} disabled={draft !== null} onClick={() => setDraft(make())}>
          Add a {noun}
        </button>
        {!draft && <SelectionBar sel={sel} total={rows.length} noun={noun} onDelete={onDelete} />}
      </div>
      {isNew && draft && editor(draft)}
      {rows.length === 0 && !draft && (
        <EmptyState
          title={`No ${noun}s yet`}
          action={
            onExample && (
              <button type="button" className={btnGhost} onClick={onExample}>
                See an example
              </button>
            )
          }
        >
          {emptyText}
        </EmptyState>
      )}
      {rows.map((row) =>
        draft?.id === row.id ? (
          <div key={row.id}>{editor(draft)}</div>
        ) : (
          <div key={row.id} className="flex items-stretch gap-3">
            <div className="flex items-center pl-1">
              <SelectCheckbox checked={sel.has(row.id)} onChange={() => sel.toggle(row.id)} label={`Select this ${noun}`} />
            </div>
            <button
              type="button"
              disabled={draft !== null}
              onClick={() => setDraft(structuredClone(row))}
              className={`${card} ${row.example ? exampleBorder : ''} block min-w-0 flex-1 text-left hover:border-orange-300 disabled:opacity-60 dark:hover:border-orange-800`}
            >
              {row.example ? (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">{summary(row)}</div>
                  <ExampleChip />
                </div>
              ) : (
                summary(row)
              )}
            </button>
          </div>
        ),
      )}
    </div>
  );
}
