import { TabOrderList } from '@unisim/sdk';
import { MAIN_TAB, tabLabel } from '../lib/tabs';
import { useInvoicesSettings } from '../stores/invoicesSettings';
import type { Tab } from '../stores/appStore';

/**
 * Tune this app ▸ Tab order: the order the tab bar takes from a drag, for
 * anybody who cannot drag it there (the suite's tab rule). Each row has a
 * grip to drag (mouse or finger) and Move up / Move down buttons.
 *
 * The eye on each row hides or shows that tab (the suite rule, BRANDING.md ▸
 * "Show and hide tabs with an eye, in Tab order", James 2026-11-21): open =
 * shown, struck through = hidden. A hidden tab leaves the bar and drops to the
 * greyed Hidden group at the bottom, in the order they were hidden; shown
 * again it comes back at the bottom of the shown tabs. Documents, the main
 * tab, has no eye. Switch and order are saved in one write to the synced Tune
 * store, so they follow the account together; Reset to defaults shows every
 * tab in the app's own order again. The list itself is the SDK's
 * (`<TabOrderList>`, eye since 0.236.0).
 */
export default function TabOrderPreference({ order, onOrder }: { order: Tab[]; onOrder: (order: Tab[]) => void }) {
  const hidden = useInvoicesSettings((s) => s.hiddenTabs);
  return (
    <TabOrderList<Tab>
      className="py-2"
      order={order}
      onChange={onOrder}
      label={tabLabel}
      hidden={(tab) => hidden.includes(tab)}
      canHide={(tab) => tab !== MAIN_TAB}
      onHiddenChange={(tab, hide, next) =>
        useInvoicesSettings.set({
          tabOrder: next,
          hiddenTabs: hide ? [...hidden.filter((t) => t !== tab), tab] : hidden.filter((t) => t !== tab),
        })
      }
      // The SDK's line speaks of a Tune tab on the bar; Invoices' Tune is in the header.
      note={`Drag a tab along the bar, or move it here. The eye hides or shows a tab; ${tabLabel(MAIN_TAB)} always shows.`}
    />
  );
}
