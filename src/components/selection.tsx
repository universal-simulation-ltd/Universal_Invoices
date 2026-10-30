import { useMemo, useState } from 'react';
import { btnDanger, btnGhost, checkboxCls, confirmAction } from './ui';

/**
 * Select several rows of a list, then act on them together — the suite rule
 * for every list (James, 2026-10-30: "In lists there needs to be a way to
 * select multiple items to delete etc"). Each list puts a checkbox on its rows
 * and <SelectionBar> above them; the bar only appears once something is
 * ticked, so a list you are just reading stays quiet.
 */
export function useSelection(ids: string[]) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Rows that have gone (deleted, filtered out) drop out of the selection.
  const selected = useMemo(() => new Set([...picked].filter((id) => ids.includes(id))), [picked, ids]);
  return {
    selected,
    has: (id: string) => selected.has(id),
    toggle: (id: string) =>
      setPicked((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    all: selected.size > 0 && selected.size === ids.length,
    toggleAll: () => setPicked(selected.size === ids.length ? new Set() : new Set(ids)),
    clear: () => setPicked(new Set()),
  };
}

export type Selection = ReturnType<typeof useSelection>;

export function SelectCheckbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      className={`${checkboxCls} h-5 w-5 cursor-pointer`}
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
    />
  );
}

/**
 * "Select all" always (so a long list can be emptied in two clicks); the count
 * and Delete selected once something is ticked. `noun` is singular.
 */
export function SelectionBar({
  sel,
  total,
  noun,
  onDelete,
}: {
  sel: Selection;
  total: number;
  noun: string;
  onDelete: (ids: string[]) => void | Promise<void>;
}) {
  if (total === 0) return null;
  const n = sel.selected.size;
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
      <label className="inline-flex cursor-pointer items-center gap-2">
        <SelectCheckbox checked={sel.all} onChange={sel.toggleAll} label="Select all" />
        {n ? `${n} selected` : 'Select all'}
      </label>
      {n > 0 && (
        <>
          <button
            type="button"
            className={`${btnDanger} py-1.5`}
            onClick={async () => {
              if (!confirmAction(`Delete ${n} ${n === 1 ? noun : `${noun}s`}? This cannot be undone.`)) return;
              await onDelete([...sel.selected]);
              sel.clear();
            }}
          >
            Delete selected
          </button>
          <button type="button" className={`${btnGhost} py-1.5`} onClick={sel.clear}>
            Clear
          </button>
        </>
      )}
    </div>
  );
}
