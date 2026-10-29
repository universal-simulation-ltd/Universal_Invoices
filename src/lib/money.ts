// Typing money in. Amounts are stored as integer minor units; this is the
// other direction — "1 234,56", "1,234.56", "€50", "50" → cents.

import type { NumberStyle } from './types';

/**
 * Parse what someone typed. The style decides which of ',' and '.' is the
 * decimal point when only one of them appears ("1,234" is 1234 in English and
 * 1.234 in French); when both appear, the LAST one is the decimal point,
 * whatever the style — nobody writes "1.234,56" meaning anything else.
 * Returns null for anything that is not a number.
 */
export function parseMoney(input: string, style: NumberStyle): number | null {
  const cleaned = input.replace(/[\s\u00a0\u202f€£$]/g, '');
  if (!cleaned) return null;
  if (!/^-?[\d.,]+$/.test(cleaned)) return null;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let decimal: ',' | '.' | null;
  if (lastComma >= 0 && lastDot >= 0) decimal = lastComma > lastDot ? ',' : '.';
  else if (lastComma >= 0) decimal = style === 'fr' || cleaned.length - lastComma - 1 !== 3 ? ',' : null;
  else if (lastDot >= 0) decimal = style === 'en' || cleaned.length - lastDot - 1 !== 3 ? '.' : null;
  else decimal = null;
  const group = decimal === ',' ? '.' : decimal === '.' ? ',' : /[.,]/;
  const normal = cleaned.split(group).join('').replace(',', '.');
  const value = Number(normal);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Minor units → what goes back in the input box: "1234.5" → "1 234,50". */
export function moneyInputValue(minor: number | undefined, style: NumberStyle): string {
  if (minor === undefined) return '';
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = String(Math.floor(abs / 100));
  const cents = String(abs % 100).padStart(2, '0');
  const text = cents === '00' ? whole : `${whole}${style === 'fr' ? ',' : '.'}${cents}`;
  return negative ? `-${text}` : text;
}

/** A quantity or a rate: "2,5" or "2.5" → 2.5. */
export function parseDecimal(input: string): number | null {
  const cleaned = input.replace(/[\s\u00a0%]/g, '').replace(',', '.');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
