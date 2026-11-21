// The app's tabs and the order you put them in (James, 2026-10-31: "start with
// your companies tab"; "allow the user to click and drag navigation order" —
// the suite's tab rule, Docs_UNI_SIM/BRANDING.md ▸ Tabs reorder: hold and
// drag). The order is a Tune setting, kept in the synced Tune store
// (stores/invoicesSettings.ts) so it follows the account; Reset to defaults
// puts this order back.
//
// Which tabs show is a Tune setting too (the suite's eye rule, BRANDING.md ▸
// "Show and hide tabs with an eye, in Tab order", James 2026-11-21): the eye
// on each Tab order row hides or shows a tab. Documents is where the work is
// made — every "New …", every open document lands there — so it is the main
// tab: always shown, no eye.

import type { Tab } from '../stores/appStore';
import { KIND_ORDER, kindPlural, type BusinessDocKind } from './types';

export const TABS: { value: Tab; label: string }[] = [
  { value: 'companies', label: 'Your companies' },
  { value: 'documents', label: 'Documents' },
  { value: 'clients', label: 'Clients' },
  { value: 'catalogue', label: 'Catalogue' },
];
export const TAB_VALUES = TABS.map((t) => t.value);
export const tabLabel = (tab: Tab) => TABS.find((t) => t.value === tab)!.label;

/** A stored order made whole: unknown tabs dropped, missing ones (a newer app's) added at the end. */
export function normaliseOrder(raw: unknown): Tab[] {
  const known = Array.isArray(raw) ? raw.filter((t, i): t is Tab => TAB_VALUES.includes(t as Tab) && raw.indexOf(t) === i) : [];
  return [...known, ...TAB_VALUES.filter((t) => !known.includes(t))];
}

/** The main tab: always on the bar, never given an eye. */
export const MAIN_TAB: Tab = 'documents';

/** A stored list of hidden tabs made safe: known tabs only, each once, never the main tab. */
export function normaliseHidden(raw: unknown): Tab[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t, i): t is Tab => TAB_VALUES.includes(t as Tab) && t !== MAIN_TAB && raw.indexOf(t) === i);
}

/** The tabs the bar shows, in their order. Never empty: the main tab always shows. */
export function shownTabs(order: Tab[], hidden: readonly Tab[]): Tab[] {
  return order.filter((t) => !hidden.includes(t));
}

/**
 * Where the app opens when nothing (shown) was chosen: Your companies, the
 * app's own default (James, 2026-11-10) — or, with that tab hidden, the first
 * tab on the bar. A chosen default that is hidden now falls back here too, and
 * comes back when its tab is shown again.
 */
export function homeFallback(shown: Tab[]): Tab {
  return shown.includes('companies') ? 'companies' : shown[0] ?? MAIN_TAB;
}

/** `tab` moved to index `to`. */
export function moveTab(order: Tab[], tab: Tab, to: number): Tab[] {
  const rest = order.filter((t) => t !== tab);
  rest.splice(Math.max(0, Math.min(to, rest.length)), 0, tab);
  return rest;
}

/**
 * The Documents sidebar: All, then each kind. A double tap on one makes it
 * what Documents opens on (the suite rule); Tune this app ▸ "Documents shows"
 * is the same choice, and Reset to defaults clears it.
 */
export type DocumentsView = BusinessDocKind | 'all';
export const DOCUMENTS_VIEWS: { value: DocumentsView; label: string }[] = [
  { value: 'all', label: 'All' },
  ...KIND_ORDER.map((k) => ({ value: k, label: kindPlural(k) })),
];
export const DOCUMENTS_VIEW_VALUES = DOCUMENTS_VIEWS.map((v) => v.value);
