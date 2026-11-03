// The app's tabs and the order you put them in (James, 2026-10-31: "start with
// your companies tab"; "allow the user to click and drag navigation order" —
// the suite's tab rule, Docs_UNI_SIM/BRANDING.md ▸ Tabs reorder: hold and
// drag). The order is a Tune setting, saved with the SDK's useUserPrefs so it
// follows the account; Reset to defaults puts this order back.

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
