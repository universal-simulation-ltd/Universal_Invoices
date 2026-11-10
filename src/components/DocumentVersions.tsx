import { useId, useState } from 'react';
import { formatMoney } from '@unisim/doc';
import { renderPdf } from '../lib/pdf';
import { KIND_NAMES, type DocVersion, type InvoiceDoc, type VersionReason } from '../lib/types';
import { asVersion } from '../lib/versions';
import { btnGhost, btnIcon, confirmAction, inputCls } from './ui';

const REASON: Record<VersionReason, string> = {
  download: 'Downloaded',
  share: 'Shared',
  sign: 'Signed',
  manual: 'Saved',
  convert: 'Before converting the currency',
  restore: 'Before going back',
};

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * "Versions" at the foot of the project timeline (James, 2026-11-10: "each
 * time you click download pdf / share it makes a snapshot and lists that under
 * that section in the project timeline with an X to remove it"). Newest first.
 * View opens that version's PDF; Restore goes back to it (how it reads now is
 * saved first, so that can be undone from here too); ✕ removes it. "Save a
 * version" is for the rewind that comes before anything is downloaded.
 */
export default function DocumentVersions({
  doc,
  onSave,
  onRestore,
  onRemove,
}: {
  doc: InvoiceDoc;
  onSave: (name: string) => void;
  onRestore: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const panel = useId();
  const versions = [...(doc.versions ?? [])].reverse();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const money = (v: DocVersion) => formatMoney(v.total, v.currency, doc.numberStyle, true);
  const kind = KIND_NAMES[doc.kind].toLowerCase();

  const view = (v: DocVersion) => {
    const url = URL.createObjectURL(renderPdf(asVersion(doc, v)).blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-sm font-semibold text-slate-900 dark:text-slate-100"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden className={`inline-block text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>
          ›
        </span>
        Versions of this {kind}
        <span className="font-normal text-slate-500 dark:text-slate-400">
          {versions.length ? `${versions.length} · newest ${when(versions[0].at)}` : 'none yet'}
        </span>
      </button>
      {open && (
        <div id={panel} className="mt-2 space-y-2">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onSave(name);
              setName('');
            }}
          >
            <input
              className={`${inputCls} min-w-0 flex-1 sm:max-w-xs`}
              placeholder="Name (optional)"
              aria-label="Version name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className={btnGhost}>
              Save a version
            </button>
          </form>
          {versions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              A version is saved each time you download, share or sign this {kind}, and before a currency conversion. Save one yourself before a change you might want to undo.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-900 dark:text-slate-100">{v.name ?? REASON[v.reason]}</span>
                    <span className="tabular block text-xs text-slate-500 dark:text-slate-400">
                      {v.name ? `${REASON[v.reason]} · ` : ''}
                      {when(v.at)} · {money(v)}
                    </span>
                  </span>
                  <button type="button" className={btnGhost} onClick={() => view(v)}>
                    View
                  </button>
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => {
                      if (confirmAction(`Go back to this version from ${when(v.at)}? How the ${kind} reads now is saved as a version first, so you can come back to it.`)) onRestore(v.id);
                    }}
                  >
                    Restore
                  </button>
                  <button type="button" className={btnIcon} aria-label={`Remove the version from ${when(v.at)}`} title="Remove" onClick={() => onRemove(v.id)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
