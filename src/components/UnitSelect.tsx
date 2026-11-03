import { useState } from 'react';
import { UNITS, unitLabel, unitOf } from '../lib/units';
import { inputCls, selectCls } from './ui';

const OTHER = '__other';

/**
 * The unit, from a list (lib/units.ts) — or, with "Other…", typed. A unit
 * written before the list, or in French, shows as the list's own when it is
 * one ("unité" is unit(s)); one that is not stays typed.
 */
export default function UnitSelect({ value, onChange, ariaLabel = 'Unit' }: { value: string; onChange: (unit: string) => void; ariaLabel?: string }) {
  const known = unitOf(value);
  const [typing, setTyping] = useState(() => !!value.trim() && !known);
  if (typing) {
    return (
      <div className="relative">
        <input className={`${inputCls} pr-8`} value={value} placeholder="Type a unit" aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} autoFocus={!value} />
        <button
          type="button"
          className="absolute inset-y-0 right-0 w-8 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          title="Pick from the list"
          aria-label="Pick the unit from the list"
          onClick={() => {
            setTyping(false);
            if (!unitOf(value)) onChange('');
          }}
        >
          ▾
        </button>
      </div>
    );
  }
  return (
    <select
      className={selectCls}
      value={known?.key ?? ''}
      aria-label={ariaLabel}
      onChange={(e) => (e.target.value === OTHER ? (onChange(''), setTyping(true)) : onChange(e.target.value))}
    >
      <option value="">—</option>
      {UNITS.map((u) => (
        <option key={u.key} value={u.key}>
          {unitLabel(u)}
        </option>
      ))}
      <option value={OTHER}>Other…</option>
    </select>
  );
}
