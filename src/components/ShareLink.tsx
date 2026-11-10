import { useCallback, useEffect, useRef, useState } from 'react';
import { useUniversal, useUser } from '@unisim/sdk';
import { companyRef } from '../lib/companyShare';
import { pdfFileName } from '../lib/convert';
import { renderPdf } from '../lib/pdf';
import { shareHooks } from '../lib/shareHooks';
import { KIND_NAMES, type InvoiceDoc } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import { btnGhost, checkboxCls } from './ui';

// A link to a document (James, 2026-11-03: "when saving a document provide a
// shareable link (private by default but able to share)"). The PDF is kept on
// the Universal ID in the platform's `app_shares` (migration 0322) and opened
// at ?share=<id> (SharedDocument.tsx). PRIVATE until "Anyone with the link"
// is ticked: until then the link opens only for you, signed in.

const PRODUCT = 'invoices';
const KEEP_CURRENT_MS = 4000;

export const shareUrl = (id: string) => `${location.origin}${import.meta.env.BASE_URL}?share=${encodeURIComponent(id)}`;

interface Share {
  id: string;
  public: boolean;
}

async function pdfBase64(doc: InvoiceDoc, pdf?: Blob): Promise<string> {
  const bytes = new Uint8Array(await (pdf ?? renderPdf(doc).blob).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * The Share button and its panel. `openSignal` going up opens the panel and
 * makes the link if there is none yet — Download PDF does that, so saving a
 * document hands you its link.
 */
export default function ShareLink({ doc, openSignal, pdf, onOpen }: { doc: InvoiceDoc; openSignal: number; /** The signed copy, shared instead while it is current. */ pdf?: Blob; /** Opened from its own button: the editor saves a version (what is about to be shared). */ onOpen?: () => void }) {
  const { supabase } = useUniversal();
  const { user } = useUser();
  const signedIn = !!user && !(user as { is_anonymous?: boolean }).is_anonymous;
  const backupOff = useAppStore((s) => s.cloud.status === 'off');
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<Share | null | undefined>(undefined); // undefined = not looked yet
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const sent = useRef<number | null>(null);

  // Is there a link already?
  useEffect(() => {
    if (!signedIn) return;
    let gone = false;
    void supabase
      .from('app_shares')
      .select('id, public')
      .eq('product', PRODUCT)
      .eq('ref_id', doc.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!gone) setShare((data as Share | null) ?? null);
      });
    return () => {
      gone = true;
    };
  }, [signedIn, supabase, doc.id]);

  const upload = useCallback(
    async (patch: { public?: boolean } = {}) => {
      if (!user) return;
      const row = {
        user_id: user.id,
        product: PRODUCT,
        ref_id: doc.id,
        title: `${KIND_NAMES[doc.kind]} ${doc.number}${doc.client.name ? ` — ${doc.client.name}` : ''}`,
        file_name: pdfFileName(doc),
        mime_type: 'application/pdf',
        data: await pdfBase64(doc, pdf),
        ...patch,
      };
      const { data, error: e } = await supabase.from('app_shares').upsert(row, { onConflict: 'user_id,product,ref_id' }).select('id, public').single();
      if (e) throw new Error(/too_large/.test(e.message) ? 'This PDF is over 5 MB — too big to share by link.' : 'The link could not be saved. Try again in a moment.');
      sent.current = doc.updatedAt;
      setShare(data as Share);
    },
    [supabase, user, doc, pdf],
  );

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    fn()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  // Saving a document (Download PDF) opens this and makes a private link —
  // unless the online backup is off: then nothing goes online unasked.
  useEffect(() => {
    if (!openSignal) return;
    setOpen(true);
    if (signedIn && share === null && !backupOff) run(() => upload());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on the signal only
  }, [openSignal]);

  // A shared document stays current: the PDF behind the link follows your edits.
  useEffect(() => {
    if (!share || sent.current === doc.updatedAt) return;
    const t = setTimeout(() => void upload().catch(() => undefined), KEEP_CURRENT_MS);
    return () => clearTimeout(t);
  }, [share, doc.updatedAt, upload]);

  return (
    <div className="relative">
      <button
        type="button"
        className={btnGhost}
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((o) => !o);
        }}
      >
        Share
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {!signedIn ? (
            <p className="text-slate-700 dark:text-slate-300">
              Sign in with your Universal ID (top right) to get a link to this {KIND_NAMES[doc.kind].toLowerCase()}. Signed out, nothing leaves this browser.
            </p>
          ) : share === undefined ? (
            <p className="text-slate-500">Looking for a link…</p>
          ) : share === null ? (
            <>
              <p className="text-slate-700 dark:text-slate-300">
                A link to this {KIND_NAMES[doc.kind].toLowerCase()}’s PDF, kept on your Universal ID. It is private until you choose to share it.
              </p>
              <button type="button" className={btnGhost} disabled={busy} onClick={() => run(() => upload())}>
                {busy ? 'Making the link…' : 'Get a link'}
              </button>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <input readOnly className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" value={shareUrl(share.id)} onFocus={(e) => e.target.select()} aria-label="Link" />
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => {
                    void navigator.clipboard?.writeText(shareUrl(share.id)).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <label className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                <input type="checkbox" className={`${checkboxCls} mt-0.5`} checked={share.public} disabled={busy} onChange={(e) => run(() => upload({ public: e.target.checked }))} />
                <span>
                  Anyone with the link can open it
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {share.public ? 'Shared: whoever has the link sees the PDF, as it is now.' : 'Private: the link opens only for you, signed in.'}
                  </span>
                </span>
              </label>
              <button
                type="button"
                className="text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const { error: e } = await supabase.from('app_shares').delete().eq('id', share.id);
                    if (e) throw new Error('The link could not be removed. Try again in a moment.');
                    setShare(null);
                  })
                }
              >
                Stop sharing and delete the link
              </button>
            </>
          )}
          {error && <p className="text-red-700 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Deleting documents deletes their links (signed in; signed out there are none of yours to reach). */
export function ShareCleanup() {
  const { supabase } = useUniversal();
  const { user } = useUser();
  useEffect(() => {
    if (!user) return;
    shareHooks.deleted = (ids) => void supabase.from('app_shares').delete().eq('product', PRODUCT).in('ref_id', ids);
    shareHooks.companiesDeleted = (ids) => void supabase.from('app_shares').delete().eq('product', PRODUCT).in('ref_id', ids.map(companyRef));
    return () => {
      shareHooks.deleted = undefined;
      shareHooks.companiesDeleted = undefined;
    };
  }, [supabase, user]);
  return null;
}
