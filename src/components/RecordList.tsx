import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Target } from '../lib/arrange';
import { DragHandle, DropLine, useArrangeDrag } from './arrange';
import { SelectCheckbox, SelectionBar, useSelection } from './selection';
import { EmptyState, ExampleChip, LiveChip, btnDanger, btnGhost, btnPrimary, card, confirmAction, exampleBorder, liveBorder } from './ui';

/**
 * The shape the Clients, Catalogue and Companies tabs share: a list, one row
 * open for editing at a time, edited as a DRAFT and saved on Save — so a
 * half-typed address never reaches a document made in another tab meanwhile.
 * Every row can be ticked for "Delete selected" (the suite's list rule), and
 * the built-in example carries an Example chip and a dashed border.
 *
 * With `tree` the list is ARRANGED (the catalogue): rows sit in folders and
 * in the order they were dragged into, by a handle on each (arrange.tsx).
 */
export type TreeNode<T> = { kind: 'folder'; id: string; rows: T[] } | { kind: 'row'; row: T };

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
  onDuplicate,
  live,
  onExport,
  onAdd,
  adding,
  onDropFiles,
  toolbar,
  tree,
  onMove,
  onStep,
  folderHead,
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
  /** "Duplicate" in the editor: saves a copy and opens it, so it can be renamed. */
  onDuplicate?: (row: T) => Promise<T | undefined>;
  /** A row that follows something elsewhere (the live Universal ID company): a Live chip and a sky border. */
  live?: (row: T) => boolean;
  /** "Export to spreadsheet" for the ticked rows. */
  onExport?: (ids: string[]) => void;
  /** Replaces the one-row "Add a …" form with the list's own (the catalogue's add-many rows). */
  onAdd?: () => void;
  /** That form, while it is open — shown where the one-row form would be. */
  adding?: ReactNode;
  /** Files dropped on a row's card (a picture for that product). */
  onDropFiles?: (row: T, files: File[]) => void;
  /** More buttons beside "Add a …" ("New folder"). */
  toolbar?: ReactNode;
  /** Folders and rows in their arranged order; `rows` is still the flat list, for selecting. */
  tree?: TreeNode<T>[];
  onMove?: (id: string, target: Target) => void;
  /** ↑ / ↓ on a handle. */
  onStep?: (id: string, dir: -1 | 1) => void;
  /** A folder's heading, after its handle and its open/closed arrow: name, rename, delete. */
  folderHead?: (id: string, count: number) => ReactNode;
}) {
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [draft, setDraft] = useState<T | null>(null);
  const isNew = draft !== null && !rows.some((r) => r.id === draft.id);
  const sel = useSelection(rows.map((r) => r.id));
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const levels = useMemo(() => {
    const out = new Map<string | null, string[]>([[null, (tree ?? []).map((n) => (n.kind === 'folder' ? n.id : n.row.id))]]);
    for (const n of tree ?? []) if (n.kind === 'folder') out.set(n.id, n.rows.map((r) => r.id));
    return out;
  }, [tree]);
  const { drag, handle } = useArrangeDrag({
    levels,
    open: (id) => !closed.has(id),
    onMove: (id, target) => onMove?.(id, target),
    onStep: (id, dir) => onStep?.(id, dir),
  });
  // Arranging waits while a row is open or new rows are being added.
  const still = draft !== null || !!adding;
  const lineAt = (parent: string | null, before: string | null) =>
    drag?.target && drag.target.parent === parent && drag.target.before === before ? <DropLine /> : null;

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
        {!isNew && onDuplicate && (
          <button
            type="button"
            className={btnGhost}
            onClick={async () => {
              const copy = await onDuplicate(d);
              if (copy) setDraft(structuredClone(copy));
            }}
          >
            Duplicate
          </button>
        )}
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

  const rowView = (row: T, parent: string | null) =>
    draft?.id === row.id ? (
      <div key={row.id}>{editor(draft)}</div>
    ) : (
      <div
        key={row.id}
        className={`flex items-stretch gap-3 ${drag?.id === row.id ? 'opacity-40' : ''}`}
        data-drop={tree ? 'item' : undefined}
        data-id={row.id}
        data-parent={parent ?? ''}
        data-top={tree && parent === null ? row.id : undefined}
      >
        {tree && <DragHandle label={`Move this ${noun}`} disabled={still} {...handle(row.id, 'item')} />}
        <div className={`flex items-center ${tree ? '' : 'pl-1'}`}>
          <SelectCheckbox checked={sel.has(row.id)} onChange={() => sel.toggle(row.id)} label={`Select this ${noun}`} />
        </div>
        <button
          type="button"
          disabled={draft !== null}
          onClick={() => setDraft(structuredClone(row))}
          onDragOver={
            onDropFiles &&
            ((e) => {
              if (!e.dataTransfer.types.includes('Files')) return;
              e.preventDefault();
              e.stopPropagation();
              setDropOn(row.id);
            })
          }
          onDragLeave={onDropFiles && (() => setDropOn(null))}
          onDrop={
            onDropFiles &&
            ((e) => {
              if (!e.dataTransfer.files.length) return;
              e.preventDefault();
              e.stopPropagation();
              setDropOn(null);
              onDropFiles(row, [...e.dataTransfer.files]);
            })
          }
          className={`${card} ${row.example ? exampleBorder : ''} ${live?.(row) ? liveBorder : ''} ${dropOn === row.id ? 'ring-2 ring-orange-400' : ''} block min-w-0 flex-1 text-left hover:border-orange-300 disabled:opacity-60 dark:hover:border-orange-800`}
        >
          {row.example || live?.(row) ? (
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">{summary(row)}</div>
              {row.example ? <ExampleChip /> : <LiveChip />}
            </div>
          ) : (
            summary(row)
          )}
        </button>
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={draft !== null || !!adding} onClick={() => (onAdd ? onAdd() : setDraft(make()))}>
            Add a {noun}
          </button>
          {toolbar}
        </div>
        {!draft && <SelectionBar sel={sel} total={rows.length} noun={noun} onDelete={onDelete} onExport={onExport} />}
      </div>
      {isNew && draft && editor(draft)}
      {adding}
      {rows.length === 0 && !draft && !adding && (
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
      {tree
        ? tree.map((node) => {
            if (node.kind === 'row') {
              return (
                <div key={node.row.id} className="space-y-3">
                  {lineAt(null, node.row.id)}
                  {rowView(node.row, null)}
                </div>
              );
            }
            const open = !closed.has(node.id);
            // Dropping into a closed or empty folder lights its heading; an open one shows the line.
            const into = drag?.kind === 'item' && drag.target?.parent === node.id && (!open || !node.rows.length);
            return (
              <div key={node.id} className="space-y-3">
                {lineAt(null, node.id)}
                <div data-top={node.id} className={`space-y-3 ${drag?.id === node.id ? 'opacity-40' : ''}`}>
                  <div
                    data-drop="folder"
                    data-id={node.id}
                    className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-800 dark:bg-slate-900/60 ${into ? 'ring-2 ring-orange-400' : ''}`}
                  >
                    <DragHandle label="Move this folder" disabled={still} {...handle(node.id, 'folder')} />
                    <button
                      type="button"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                      aria-expanded={open}
                      aria-label={open ? 'Close this folder' : 'Open this folder'}
                      onClick={() =>
                        setClosed((c) => {
                          const next = new Set(c);
                          if (next.has(node.id)) next.delete(node.id);
                          else next.add(node.id);
                          return next;
                        })
                      }
                    >
                      <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                    </button>
                    <div className="min-w-0 flex-1">{folderHead?.(node.id, node.rows.length)}</div>
                  </div>
                  {open && (
                    <div className="space-y-3 border-l-2 border-slate-200 pl-3 sm:pl-5 dark:border-slate-800">
                      {node.rows.map((row) => (
                        <div key={row.id} className="space-y-3">
                          {lineAt(node.id, row.id)}
                          {rowView(row, node.id)}
                        </div>
                      ))}
                      {node.rows.length > 0 && lineAt(node.id, null)}
                      {!node.rows.length && (
                        <div
                          data-drop="into"
                          data-id={node.id}
                          className={`rounded-2xl border-2 border-dashed px-4 py-3 text-sm text-slate-500 dark:text-slate-400 ${into ? 'border-orange-400' : 'border-slate-200 dark:border-slate-800'}`}
                        >
                          Empty. Drag {noun}s here by their handle.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        : rows.map((row) => rowView(row, null))}
      {tree && lineAt(null, null)}
    </div>
  );
}
