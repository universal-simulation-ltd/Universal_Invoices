import { useEffect } from 'react';
import { useUniversal } from '@unisim/sdk';
import { migrateLegacyPrefs } from '../stores/invoicesSettings';

/**
 * Signed in, once per account on this device: the account's tab order and
 * Hide invoices move from the old `invoices` useUserPrefs row to the synced
 * `tune-app:invoices` row (stores/invoicesSettings.ts → migrateLegacyPrefs).
 * Renders nothing; fire-and-forget, and a failed read tries again next load.
 */
export function LegacyPrefsMigration() {
  const { supabase, session } = useUniversal();
  const user = session?.user as { id: string; is_anonymous?: boolean } | undefined;
  const uid = user && !user.is_anonymous ? user.id : null;
  useEffect(() => {
    if (!uid) return;
    void migrateLegacyPrefs(uid, {
      read: async (app) => {
        const { data, error } = await supabase.from('user_app_prefs').select('data').eq('app', app).maybeSingle();
        return { data: data as { data?: unknown } | null, error };
      },
      write: async (app, data) => {
        await supabase.from('user_app_prefs').upsert({ user_id: uid, app, data }, { onConflict: 'user_id,app' });
      },
      storage: window.localStorage,
      now: () => Date.now(),
    });
  }, [supabase, uid]);
  return null;
}
