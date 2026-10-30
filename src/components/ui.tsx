import { useEffect, useState, type ReactNode } from 'react';
import { moneyInputValue, parseDecimal, parseMoney } from '../lib/money';
import type { NumberStyle } from '../lib/types';

// Shared class strings — one visual language across the app (PalsPayIn's).
export const btnPrimary =
  'rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-40';
export const btnGhost =
  'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
export const btnDanger =
  'rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950';
export const btnIcon =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-100';
// `min-w-0` is load-bearing on a phone: without it a field's intrinsic width
// forces its grid track wider than the screen.
export const inputCls =
  'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
// `selectBase` sizes to its content (toolbars); `selectCls` fills its field.
export const selectBase =
  'min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
export const selectCls = `${selectBase} w-full`;
export const checkboxCls = 'h-4 w-4 shrink-0 accent-orange-600';
export const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900';
export const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';
export const sectionTitle = 'text-sm font-semibold text-slate-900 dark:text-slate-100';

export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

/** One text box per line — addresses, bank details, the footer. */
export function LinesInput({ value, onChange, rows = 4, placeholder }: { value: string[]; onChange: (v: string[]) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea
      className={`${inputCls} resize-y`}
      rows={rows}
      placeholder={placeholder}
      value={value.join('\n')}
      onChange={(e) => onChange(e.target.value.split('\n'))}
    />
  );
}

/**
 * Money in a text box. It keeps what you typed while you type ("1 234,5" is
 * not reformatted under your cursor) and only re-renders the stored value
 * when the field is not being edited.
 */
export function MoneyInput({
  value,
  onChange,
  style,
  placeholder,
  ariaLabel,
  className = '',
}: {
  value: number | undefined;
  onChange: (minor: number | undefined) => void;
  style: NumberStyle;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [text, setText] = useState(moneyInputValue(value, style));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(moneyInputValue(value, style));
  }, [value, style, editing]);
  const invalid = text.trim() !== '' && parseMoney(text, style) === null;
  return (
    <input
      className={`${inputCls} tabular text-right ${invalid ? 'ring-2 ring-red-400' : ''} ${className}`}
      inputMode="decimal"
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      value={text}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseMoney(e.target.value, style);
        if (e.target.value.trim() === '') onChange(undefined);
        else if (parsed !== null) onChange(parsed);
      }}
    />
  );
}

/** A quantity or a percentage, typed with either decimal mark. */
export function DecimalInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
  className = '',
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(value === undefined ? '' : String(value));
  }, [value, editing]);
  return (
    <input
      className={`${inputCls} tabular text-right ${className}`}
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={text}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseDecimal(e.target.value);
        if (e.target.value.trim() === '') onChange(undefined);
        else if (parsed !== null) onChange(parsed);
      }}
    />
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Ask before something that cannot be undone. Native, so it works everywhere. */
export function confirmAction(message: string): boolean {
  return window.confirm(message);
}

/** The built-in example's marker, beside its name in every list. */
export function ExampleChip() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-dashed border-orange-400 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-orange-800 dark:bg-orange-950/40 dark:text-orange-300">
      Example
    </span>
  );
}

/** The example's row/card: a dashed border instead of the solid one. */
export const exampleBorder = 'border-dashed border-orange-300 dark:border-orange-800';
