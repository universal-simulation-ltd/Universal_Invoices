import { useEffect, useState, type ReactNode } from 'react';
import { buttonClass, GrowingTextarea } from '@unisim/sdk';
import { discountInputValue, moneyInputValue, parseDecimal, parseDiscount, parseMoney } from '../lib/money';
import type { Discount, NumberStyle } from '../lib/types';

// Shared class strings — one visual language across the app (PalsPayIn's).
// Buttons are the suite's key buttons (SDK 0.216, BRANDING.md → Buttons,
// 2026-11-04): main.tsx installs their CSS. Primary is once per view; add
// `u-btn--sm` for the small size, and put an icon in a <Key> as the first child.
export const btnPrimary = buttonClass('primary');
export const btnGhost = buttonClass();
export const btnDanger = buttonClass('danger');
export const btnSoft = buttonClass('soft');
export const btnQuiet = buttonClass('quiet');

/** A key button's icon block, its first child. */
export function Key({ children }: { children: ReactNode }) {
  return (
    <span className="u-btn__key" aria-hidden>
      {children}
    </span>
  );
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
export const PlusIcon = () => icon('M12 5v14M5 12h14');
export const FolderIcon = () => icon('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z');
export const CheckIcon = () => icon('M5 12.5l4.5 4.5L19 7.5');
export const BinIcon = () => icon('M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3');
export const UploadIcon = () => icon('M12 16V4M7 9l5-5 5 5M5 20h14');
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
export function LinesInput({ value, onChange, rows = 4, placeholder, live = false }: { value: string[]; onChange: (v: string[]) => void; rows?: number; placeholder?: string; live?: boolean }) {
  return (
    <GrowingTextarea
      className={live ? `${liveInputCls} resize-none` : `${inputCls} resize-y`}
      readOnly={live}
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

/**
 * A discount: "10%" for a percentage, a plain number for an amount. Empty or
 * 0 is none. Kept as typed while typing, like MoneyInput.
 */
export function DiscountInput({
  value,
  onChange,
  style,
  ariaLabel,
  className = '',
}: {
  value: Discount | undefined;
  onChange: (v: Discount | undefined) => void;
  style: NumberStyle;
  ariaLabel?: string;
  className?: string;
}) {
  const [text, setText] = useState(discountInputValue(value, style));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(discountInputValue(value, style));
  }, [value, style, editing]);
  const invalid = text.trim() !== '' && parseDiscount(text, style) === null;
  return (
    <input
      className={`${inputCls} tabular text-right ${invalid ? 'ring-2 ring-red-400' : ''} ${className}`}
      inputMode="decimal"
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      placeholder="—"
      title="A percentage (10%) or an amount (50)"
      value={text}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseDiscount(e.target.value, style);
        if (e.target.value.trim() === '') onChange(undefined);
        else if (parsed !== null) onChange(('percent' in parsed ? parsed.percent : parsed.amount) ? parsed : undefined);
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

/**
 * Synced: this follows your Universal ID company and updates itself (James,
 * 2026-10-30: "highlight the box to show it's dynamic"). Sky, not orange — the
 * app's orange already means "act here", and this means "set elsewhere".
 * Called "Live" until 2026-11-03, when James found it read like "Active".
 */
export function SyncedChip() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
      <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden />
      Synced
    </span>
  );
}

export const liveBorder = 'border-sky-300 ring-1 ring-sky-200 dark:border-sky-800 dark:ring-sky-900/60';

/** A form field the hub fills in: read-only here, tinted to say so. */
export const liveInputCls =
  'w-full min-w-0 cursor-default rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-sm text-slate-800 focus:outline-none dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-slate-200';

/** "company" → "companies", "client" → "clients": the plural every list says. */
export const plural = (noun: string) => (/[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`);
