import { useRef } from 'react';
import { AdvancedMenu, AdvancedMenuItem } from '@unisim/sdk';
import { saveBlob } from '@unisim/media/save';
// Generated — `npm run credits` after any dependency change. Never edit it by
// hand: it is read off the installed tree.
import credits from '../../generated/credits.json';
import { todayIso } from '../../lib/numbering';
import { useAppStore } from '../../stores/appStore';
import { useThemeStore } from '../../stores/themeStore';

// The per-app rows that slot into <UniversalAppsNavBar />'s `actions` prop —
// ROWS ONLY, no trigger and no panel of its own. No Appearance rows: the
// colour scheme lives only in Tune this app.
//
// Everything is in Advanced (James, 2026-10-30): backing up and restoring is
// occasional, so it sits with About rather than above the account rows; and
// the example is offered on the landing page while nothing is saved, not here.

export default function AppMenu() {
  const backupJson = useAppStore((s) => s.backupJson);
  const restore = useAppStore((s) => s.restore);
  // The SDK rows are inline-styled, so they need the RESOLVED theme to match
  // a dark dropdown.
  const theme = useThemeStore((s) => s.effective);
  const file = useRef<HTMLInputElement>(null);

  return (
    <>
      <AdvancedMenu
        theme={theme}
        about={{
          repo: 'https://github.com/universal-simulation-ltd/Universal_Invoices',
          subject: 'Your companies, clients, catalogue and documents',
          headline: 'Other invoicing tools keep your customers and prices on their servers, behind a subscription.',
          version: __APP_VERSION__,
          credits,
          noticesHref: 'https://github.com/universal-simulation-ltd/Universal_Invoices/blob/main/THIRD-PARTY-NOTICES.md',
        }}
      >
        <AdvancedMenuItem
          theme={theme}
          icon={<span aria-hidden>⤓</span>}
          label="Export a backup"
          info="Everything, in one file — to keep, or to open on another device"
          onSelect={() => void saveBlob(new Blob([backupJson()], { type: 'application/json' }), `Universal Invoices backup ${todayIso()}.json`)}
        />
        <AdvancedMenuItem
          theme={theme}
          icon={<span aria-hidden>⤒</span>}
          label="Import a backup…"
          info="Adds what is new; never deletes anything here"
          onSelect={() => file.current?.click()}
        />
      </AdvancedMenu>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            await restore(await f.text());
          } catch (err) {
            window.alert(err instanceof Error ? err.message : 'That backup could not be read.');
          }
        }}
      />
    </>
  );
}
