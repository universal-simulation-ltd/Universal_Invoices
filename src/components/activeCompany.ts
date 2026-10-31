import { useUserPrefs } from '@unisim/sdk';
import { ownCompanies, useAppStore } from '../stores/appStore';

const KEY = 'activeCompany';

/**
 * The company new documents come from (James, 2026-10-31: "have an 'active'
 * company (so no need for dropdown for which company on documents)"). Chosen
 * in Your companies; kept with the SDK's useUserPrefs so it follows the
 * account. One that has gone (deleted, or never chosen) falls back to the
 * first of your own — the live Universal ID company when there is one.
 */
export function useActiveCompany() {
  const companies = useAppStore((s) => s.companies);
  const { pref, setPref } = useUserPrefs();
  const mine = ownCompanies(companies);
  const id = pref<string | null>(KEY, null);
  const active = mine.find((c) => c.id === id) ?? mine[0];
  return { active, setActive: (companyId: string) => setPref(KEY, companyId) };
}
