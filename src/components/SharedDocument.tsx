import { useEffect, useState } from 'react';
import { useUniversal, useUser } from '@unisim/sdk';
import { saveBlob } from '@unisim/media/save';
import { btnPrimary } from './ui';

interface Shared {
  title: string;
  file_name: string;
  mime_type: string;
  data: string;
  updated_at: string;
  is_public: boolean;
  is_owner: boolean;
}

/**
 * What a share link opens (?share=<id>, ShareLink.tsx): the PDF, read through
 * app_share_get() — which answers only when it is shared, or when it is
 * yours and you are signed in.
 */
export default function SharedDocument({ id }: { id: string }) {
  const { supabase } = useUniversal();
  const { user } = useUser();
  const [state, setState] = useState<{ shared: Shared; url: string; blob: Blob } | 'loading' | 'none'>('loading');

  useEffect(() => {
    let url: string | null = null;
    let gone = false;
    void supabase.rpc('app_share_get', { p_id: id }).then(({ data }) => {
      const shared = (data as Shared[] | null)?.[0];
      if (gone) return;
      if (!shared) {
        setState('none');
        return;
      }
      const binary = atob(shared.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: shared.mime_type });
      url = URL.createObjectURL(blob);
      setState({ shared, url, blob });
    });
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
    // Signing in may open a private link of your own.
  }, [supabase, id, user?.id]);

  const home = (
    <a href={import.meta.env.BASE_URL} className="font-medium text-orange-700 hover:underline dark:text-orange-400">
      Open Universal Invoices
    </a>
  );

  if (state === 'loading') return <p className="py-10 text-center text-sm text-slate-500">Opening the document…</p>;
  if (state === 'none') {
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">This link is private, or no longer shared</h1>
        <p>{user ? 'Ask whoever sent it to share it.' : 'If it is yours, sign in (top right) to open it. Otherwise ask whoever sent it to share it.'}</p>
        <p>{home}</p>
      </div>
    );
  }
  const { shared, url, blob } = state;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="truncate font-semibold text-slate-900 dark:text-slate-100">{shared.title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Updated {new Date(shared.updated_at).toLocaleString()}
            {shared.is_owner && (shared.is_public ? ' · Shared: anyone with the link can open it' : ' · Private: only you can open this link')}
          </p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => void saveBlob(blob, shared.file_name || 'document.pdf')}>
          Download PDF
        </button>
      </div>
      <iframe title={shared.title} src={`${url}#view=FitH`} className="h-[80vh] w-full rounded-2xl border border-slate-200 bg-white dark:border-slate-800" />
      <p className="text-xs text-slate-500 dark:text-slate-400">Made with Universal Invoices · {home}</p>
    </div>
  );
}
