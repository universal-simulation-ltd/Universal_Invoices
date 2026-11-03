// Document numbers. A pattern per company per kind, with its own counter:
// "INV-{YYYY}{MM}{DD}-{N}" → INV-20261103-10 (the default), or
// "DEV-{YYYY}{MM}{DD}-{N:5}" → DEV-20260727-00406 (the Sellsy shape).

import type { BusinessDocKind, BusinessDocLanguage, Numbering } from './types';

export function formatNumber(pattern: string, isoDate: string, n: number): string {
  const [yyyy = '0000', mm = '00', dd = '00'] = isoDate.split('-');
  return pattern.replace(/\{(YYYY|YY|MM|DD|N(?::(\d+))?)\}/g, (_, token: string, pad?: string) => {
    switch (token) {
      case 'YYYY':
        return yyyy;
      case 'YY':
        return yyyy.slice(-2);
      case 'MM':
        return mm;
      case 'DD':
        return dd;
      default:
        return String(n).padStart(pad ? Number(pad) : 1, '0');
    }
  });
}

/**
 * Starting patterns. French ones use the French document names' initials
 * (DEVis, PROforma, FACture, Bon de Livraison) — what a French accountant
 * expects to see; English ones the English names'. The counter is unpadded
 * and starts at 10 (James, 2026-11-03: "INV-20261103-10 … starting at 10 makes
 * it look like other documents have been done"); past 99 it just grows.
 */
export function defaultNumbering(language: BusinessDocLanguage): Record<BusinessDocKind, Numbering> {
  const p = language === 'fr'
    ? { quote: 'DEV', estimate: 'DEV', proforma: 'PRO', invoice: 'FAC', 'delivery-note': 'BL' }
    : { quote: 'QUO', estimate: 'EST', proforma: 'PRO', invoice: 'INV', 'delivery-note': 'DN' };
  const out = {} as Record<BusinessDocKind, Numbering>;
  for (const kind of Object.keys(p) as BusinessDocKind[]) {
    out[kind] = { pattern: `${p[kind]}-{YYYY}{MM}{DD}-{N}`, next: 10 };
  }
  return out;
}

/** ISO date `days` after `iso`. Noon UTC, so no time zone can move the day. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today in the browser's own time zone, as ISO. */
export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * A number from somewhere else that fits the pattern (an imported
 * DEV-20260927-00411 against DEV-{YYYY}{MM}{DD}-{N:5}) moves the counter past
 * it, so the next one made here carries on the sequence instead of going
 * back to 1. Returns the counter unchanged when it does not fit.
 */
export function counterAfter(numbering: Numbering, number: string): Numbering {
  let groups = 0;
  let n = -1;
  const source = numbering.pattern
    .split(/(\{(?:YYYY|YY|MM|DD|N(?::\d+)?)\})/)
    .map((part, i) => {
      if (i % 2 === 0) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      groups++;
      if (part.startsWith('{N')) n = groups;
      return part === '{YYYY}' ? '(\\d{4})' : part.startsWith('{N') ? '(\\d+)' : '(\\d{2})';
    })
    .join('');
  const m = n > 0 ? number.trim().match(new RegExp(`^${source}$`)) : null;
  if (!m) return numbering;
  const used = Number(m[n]);
  return used >= numbering.next ? { ...numbering, next: used + 1 } : numbering;
}
