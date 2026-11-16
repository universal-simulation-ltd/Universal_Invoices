// Documents filtered by date (James, 2026-11-16: "have a way to filter by
// date also, maybe a calendar icon attached to the search box"). A range is
// two ISO dates, either end open; a document is in it by its own date. Pure.

import { formatDate } from '@unisim/doc';
import { todayIso } from './numbering';

export interface DateRange {
  /** First day in, YYYY-MM-DD. */
  from?: string;
  /** Last day in, YYYY-MM-DD. */
  to?: string;
}

export type DatePreset = 'this-month' | 'last-month' | 'this-year' | 'last-year';
export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'this-year', label: 'This year' },
  { value: 'last-year', label: 'Last year' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function presetRange(preset: DatePreset, today = todayIso()): Required<DateRange> {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  switch (preset) {
    case 'this-month':
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
    case 'last-month': {
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}` };
    }
    case 'this-year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'last-year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
}

/** The preset a range is exactly, if it is one. */
export function presetOf(range: DateRange, today = todayIso()): DatePreset | undefined {
  return DATE_PRESETS.find((p) => {
    const r = presetRange(p.value, today);
    return r.from === range.from && r.to === range.to;
  })?.value;
}

export const isSet = (range: DateRange) => !!(range.from || range.to);

export function inRange(date: string, { from, to }: DateRange): boolean {
  // A range typed backwards still means the days between.
  const [lo, hi] = from && to && from > to ? [to, from] : [from, to];
  return (!lo || date >= lo) && (!hi || date <= hi);
}

/** "This month", "1 Oct 2026 – 15 Oct 2026", "From 1 Oct 2026", "Until 15 Oct 2026". */
export function rangeLabel(range: DateRange, today = todayIso()): string {
  const preset = presetOf(range, today);
  if (preset) return DATE_PRESETS.find((p) => p.value === preset)!.label;
  const { from, to } = range;
  if (from && to) return from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `From ${formatDate(from)}`;
  if (to) return `Until ${formatDate(to)}`;
  return 'Any date';
}
