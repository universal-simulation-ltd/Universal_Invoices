// Document numbers. A pattern per company per kind, with its own counter:
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
 * expects to see; English ones the English names'.
 */
export function defaultNumbering(language: BusinessDocLanguage): Record<BusinessDocKind, Numbering> {
  const p = language === 'fr'
    ? { quote: 'DEV', estimate: 'DEV', proforma: 'PRO', invoice: 'FAC', 'delivery-note': 'BL' }
    : { quote: 'QUO', estimate: 'EST', proforma: 'PRO', invoice: 'INV', 'delivery-note': 'DN' };
  const out = {} as Record<BusinessDocKind, Numbering>;
  for (const kind of Object.keys(p) as BusinessDocKind[]) {
    out[kind] = { pattern: `${p[kind]}-{YYYY}{MM}{DD}-{N:5}`, next: 1 };
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
