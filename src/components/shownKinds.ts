import { useUserPrefs } from '@unisim/sdk';
import { KIND_ORDER, type BusinessDocKind } from '../lib/types';

/**
 * "Hide invoices" in Tune this app (James, 2026-11-10): for anyone who issues
 * invoices elsewhere — a French business on an approved e-invoicing platform
 * (lib/france.ts). The Invoice kind leaves the New document menu, the
 * Documents sidebar (while there are none) and the project timeline's
 * to-do steps. Invoices already made stay where they are. Kept with the
 * SDK's useUserPrefs, so it follows the account.
 */
export const HIDE_INVOICES = 'hideInvoices';
/** The French e-invoicing note on an invoice (DocumentEditor), once "Got it" is pressed. */
export const FRENCH_NOTE_SEEN = 'frenchEInvoiceNoteSeen';

export function useShownKinds(): { hideInvoices: boolean; setHideInvoices: (on: boolean) => void; kinds: BusinessDocKind[] } {
  const { pref, setPref } = useUserPrefs();
  const hideInvoices = pref<boolean>(HIDE_INVOICES, false) === true;
  return {
    hideInvoices,
    setHideInvoices: (on) => setPref(HIDE_INVOICES, on ? true : null),
    kinds: hideInvoices ? KIND_ORDER.filter((k) => k !== 'invoice') : KIND_ORDER,
  };
}
