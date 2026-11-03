// Units to pick from (James, 2026-11-03: "have the unit choice as dropdown,
// make sure english is in english; unit(s), day(s)…"). A line keeps the
// English singular ("day"); the PDF prints it in the document's language, one
// or many by the quantity — 1 day, 3 jours. Anything typed that is not on the
// list (or a unit from before the list) prints as it was written, and one
// written in either language ("unité", "days") is recognised as its unit.

import type { BusinessDocLanguage } from './types';

interface Unit {
  key: string;
  en: [string, string];
  fr: [string, string];
}

export const UNITS: Unit[] = [
  { key: 'unit', en: ['unit', 'units'], fr: ['unité', 'unités'] },
  { key: 'item', en: ['item', 'items'], fr: ['article', 'articles'] },
  { key: 'set', en: ['set', 'sets'], fr: ['lot', 'lots'] },
  { key: 'licence', en: ['licence', 'licences'], fr: ['licence', 'licences'] },
  { key: 'seat', en: ['seat', 'seats'], fr: ['poste', 'postes'] },
  { key: 'package', en: ['package', 'packages'], fr: ['forfait', 'forfaits'] },
  { key: 'session', en: ['session', 'sessions'], fr: ['séance', 'séances'] },
  { key: 'person', en: ['person', 'people'], fr: ['personne', 'personnes'] },
  { key: 'hour', en: ['hour', 'hours'], fr: ['heure', 'heures'] },
  { key: 'half day', en: ['half day', 'half days'], fr: ['demi-journée', 'demi-journées'] },
  { key: 'day', en: ['day', 'days'], fr: ['jour', 'jours'] },
  { key: 'week', en: ['week', 'weeks'], fr: ['semaine', 'semaines'] },
  { key: 'month', en: ['month', 'months'], fr: ['mois', 'mois'] },
  { key: 'year', en: ['year', 'years'], fr: ['an', 'ans'] },
];

const fold = (s: string) => s.trim().toLowerCase().replace(/\(s\)$/, '').trim();
const BY_NAME = new Map<string, Unit>();
for (const u of UNITS) for (const name of [u.key, ...u.en, ...u.fr]) BY_NAME.set(fold(name), u);

/** The list's unit a written one is, if any: "Days", "unité" and "day(s)" are all found. */
export function unitOf(written: string): Unit | undefined {
  return written.trim() ? BY_NAME.get(fold(written)) : undefined;
}

/** How the list shows a unit: "day(s)", "person / people". */
export function unitLabel(u: Unit): string {
  const [one, many] = u.en;
  return many === `${one}s` ? `${one}(s)` : `${one} / ${many}`;
}

/** A written unit as the app shows it: the list's label when it is one, else as written. */
export function shownUnit(written: string): string {
  const u = unitOf(written);
  return u ? unitLabel(u) : written;
}

/** A line's unit as its PDF prints it: in the document's language, one or many by the quantity. */
export function printedUnit(written: string, quantity: number, language: BusinessDocLanguage): string | undefined {
  const raw = written.trim();
  if (!raw) return undefined;
  const u = unitOf(raw);
  if (!u) return raw;
  const [one, many] = u[language];
  return Math.abs(quantity) === 1 ? one : many;
}
