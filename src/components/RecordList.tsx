import { useState, type ReactNode } from 'react';
import { EmptyState, btnDanger, btnGhost, btnPrimary, card, confirmAction } from './ui';

/**
 * The shape the Clients, Catalogue and Companies tabs share: a list, one row
 * open for editing at a time, edited as a DRAFT and saved on Save — so a
 * half-typed address never reaches a document made in another tab meanwhile.
 */
export default function RecordList<T extends { id: string }>({
  rows,
  make,
  noun,
  emptyText,
  summary,
  form,
  onSave,
  onDelete,
  deleteWarning,
}: {
  rows: T[];
  make: () => T;
  noun: string;
  emptyText: ReactNode;
  summary: (row: T) => ReactNode;
  form: (draft: T, set: (patch: Partial<T>) => void) => ReactNode;
  onSave: (row: T) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  deleteWarning?: (row: T) => string;
}) {
  const [draft, setDraft] = useState<T | null>(null);
  const isNew = draft !== null && !rows.some((r) => r.id === draft.id);

  const editor = (d: T) => (
    <div className={`${card} ring-2 ring-orange-200 dark:ring-orange-900`}>
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
              await onDelete(d.id);
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
      <div>
        <button type="button" className={btnPrimary} disabled={draft !== null} onClick={() => setDraft(make())}>
          Add a {noun}
        </button>
      </div>
      {isNew && draft && editor(draft)}
      {rows.length === 0 && !draft && <EmptyState title={`No ${noun}s yet`}>{emptyText}</EmptyState>}
      {rows.map((row) =>
        draft?.id === row.id ? (
          <div key={row.id}>{editor(draft)}</div>
        ) : (
          <button
            key={row.id}
            type="button"
            disabled={draft !== null}
            onClick={() => setDraft(structuredClone(row))}
            className={`${card} block w-full text-left hover:border-orange-300 disabled:opacity-60 dark:hover:border-orange-800`}
          >
            {summary(row)}
          </button>
        ),
      )}
    </div>
  );
}
