import { useRef } from 'react';
import { AdvancedMenu, AdvancedMenuItem } from '@unisim/sdk';
import { saveBlob } from '@unisim/media/save';
// Generated — `npm run credits` after any dependency change. Never edit it by
// hand: it is read off the installed tree.
import credits from '../../generated/credits.json';
import { todayIso } from '../../lib/numbering';
import { useAppStore } from '../../stores/appStore';
import { useThemeStore } from '../../stores/themeStore';
import { saveSpreadsheet } from '../exportSheet';

// The per-app rows that slot into <UniversalAppsNavBar />'s `actions` prop —
// ROWS ONLY, no trigger and no panel of its own. No Appearance rows: the
// colour scheme lives only in Tune this app.
//
// Everything is in Advanced (James, 2026-10-30): backing up and restoring is
// occasional, so it sits with About rather than above the account rows; and
// the example is offered on the landing page while nothing is saved, not here.
//
// A spreadsheet export sits beside the backup (James, 2026-10-30): one sheet
// per list, to edit or to bring into another account. One Import takes both.

export default function AppMenu() {
  const backupJson = useAppStore((s) => s.backupJson);
  const restore = useAppStore((s) => s.restore);
  const importSpreadsheet = useAppStore((s) => s.importSpreadsheet);
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
          icon={<span aria-hidden>▦</span>}
          label="Export to a spreadsheet"
          info="Everything as .xlsx, a sheet per list — to edit, or to import into another account. Pictures stay out."
          onSelect={() => saveSpreadsheet()}
        />
        <AdvancedMenuItem
          theme={theme}
          icon={<span aria-hidden>⤒</span>}
          label="Import…"
          info="A backup or a spreadsheet. Adds what is new and updates what changed; never deletes anything here"
          onSelect={() => file.current?.click()}
        />
      </AdvancedMenu>
      <input
        ref={file}
        type="file"
        accept="application/json,.json,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            // A spreadsheet is a zip: "PK" first, whatever the file is called.
            const bytes = new Uint8Array(await f.arrayBuffer());
            if (bytes[0] === 0x50 && bytes[1] === 0x4b) await importSpreadsheet(bytes, (m) => window.confirm(m));
            else await restore(new TextDecoder().decode(bytes));
          } catch (err) {
            window.alert(err instanceof Error ? err.message : 'That file could not be read.');
          }
        }}
      />
    </>
  );
}
