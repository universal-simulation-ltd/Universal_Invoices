import { useRef } from 'react';
import { AdvancedMenu } from '@unisim/sdk';
import { saveBlob } from '@unisim/media/save';
// Generated — `npm run credits` after any dependency change. Never edit it by
// hand: it is read off the installed tree.
import credits from '../../generated/credits.json';
import { todayIso } from '../../lib/numbering';
import { useAppStore } from '../../stores/appStore';

// The per-app rows that slot into <UniversalAppsNavBar />'s `actions` prop —
// ROWS ONLY, no trigger and no panel of its own. Inline styles match the SDK
// dropdown's own row rhythm (8px/14px, 13px labels): these render inside SDK
// chrome, not ours. No Appearance rows — the colour scheme lives only in Tune
// this app (App.tsx passes `themeStore` to the navbar).

const TINT = { bg: '#fff7ed', fg: '#c2410c' };
const REST_COLOR = '#374151';

export default function AppMenu() {
  const backupJson = useAppStore((s) => s.backupJson);
  const restore = useAppStore((s) => s.restore);
  const loadExample = useAppStore((s) => s.loadExample);
  const setTab = useAppStore((s) => s.setTab);
  const file = useRef<HTMLInputElement>(null);

  return (
    <>
      <MenuLabel>Your data</MenuLabel>
      <MenuRow
        glyph="⤓"
        label="Back up everything"
        onClick={() => void saveBlob(new Blob([backupJson()], { type: 'application/json' }), `Universal Invoices backup ${todayIso()}.json`)}
      />
      <MenuRow glyph="⤒" label="Restore from a backup…" onClick={() => file.current?.click()} />
      <MenuRow
        glyph="✦"
        label="Add the example"
        onClick={() => {
          setTab('documents');
          void loadExample();
        }}
      />
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

      {/* Advanced — the SDK's own category, so every app in the suite has one in
          the same place. "About this app" is always its last row. */}
      <AdvancedMenu
        about={{
          repo: 'https://github.com/universal-simulation-ltd/Universal_Invoices',
          subject: 'Your companies, clients, catalogue and documents',
          headline: 'Other invoicing tools keep your customers and prices on their servers, behind a subscription.',
          version: __APP_VERSION__,
          credits,
          noticesHref: 'https://github.com/universal-simulation-ltd/Universal_Invoices/blob/main/THIRD-PARTY-NOTICES.md',
        }}
      />
    </>
  );
}

function MenuLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        padding: '8px 14px 4px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#9ca3af',
      }}
    >
      {children}
    </div>
  );
}

function MenuRow({ glyph, label, onClick }: { glyph: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 14px',
        fontSize: 13,
        fontFamily: 'inherit',
        textAlign: 'left',
        border: 0,
        background: 'transparent',
        color: REST_COLOR,
        cursor: 'pointer',
        transition: 'background 120ms, color 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = TINT.bg;
        e.currentTarget.style.color = TINT.fg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = REST_COLOR;
      }}
    >
      <span aria-hidden>{glyph}</span>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 500, lineHeight: 1.3 }}>{label}</span>
    </button>
  );
}
