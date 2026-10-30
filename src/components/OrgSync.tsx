import { useEffect, useRef, useState } from 'react';
import { imageToJpeg } from '@unisim/doc';
import { useOrg, useProfile, useUser } from '@unisim/sdk';
import { uid } from '../lib/convert';
import { companyFromOrg, hubFieldsDiffer, liveFields, type LiveField, type OrgDetails } from '../lib/fromOrg';
import type { Company, StoredImage } from '../lib/types';
import { dismissedOrgs, setOrgDismissed, useAppStore } from '../stores/appStore';
import { btnGhost } from './ui';

export const HUB_DETAILS = 'https://app.unisim.co.uk/business-details';

/** The hub's logo as the JPEG the PDF embeds. Undefined if it cannot be read (an SVG some browsers will not decode, a host without CORS). */
async function logoFrom(url: string | null | undefined): Promise<StoredImage | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return undefined;
    const { jpeg, width, height } = await imageToJpeg(await res.blob(), 0.9, 1200);
    let binary = '';
    for (let i = 0; i < jpeg.length; i += 0x8000) binary += String.fromCharCode(...jpeg.subarray(i, i + 0x8000));
    return { dataUrl: `data:image/jpeg;base64,${btoa(binary)}`, width, height };
  } catch {
    return undefined;
  }
}

/**
 * The signed-in Universal ID company, and which of a stored company's fields
 * are live right now: only while signed in to the company it came from. Signed
 * out, it is an ordinary company you can edit.
 */
export function useLiveOrg(): { org: OrgDetails | null; liveFor: (c: Company) => Set<LiveField> } {
  const { org } = useOrg();
  const { user } = useUser();
  const live = user && org ? (org as OrgDetails) : null;
  const fields = live ? liveFields(live) : null;
  return {
    org: live,
    liveFor: (c) => (live && fields && c.orgId === live.id ? fields : new Set()),
  };
}

/**
 * Keeps the Universal ID company in Your companies, live (James, 2026-10-30:
 * "No need for the 'use your company' just silently create it in companies as
 * the default, and no need to click to sync, just keep it in sync with the
 * company"). Signed in to a company, it is created the first time and updated
 * whenever the hub's details differ — useOrg re-reads them when you come back
 * to the tab, so an edit on the hub lands without a reload. Renders nothing.
 *
 * Documents are untouched: each keeps the snapshot it was made with.
 */
export function OrgSync() {
  const { org } = useLiveOrg();
  const { profile } = useProfile();
  const loaded = useAppStore((s) => s.loaded);
  const companies = useAppStore((s) => s.companies);
  const syncCompany = useAppStore((s) => s.syncCompany);
  const busy = useRef(false);

  useEffect(() => {
    if (!loaded || !org || busy.current) return;
    if (dismissedOrgs().includes(org.id)) return;
    const linked = companies.find((c) => c.orgId === org.id);
    const next = companyFromOrg(org, linked, profile?.display_name ?? '', uid);
    const logoUrl = org.logo_url ?? undefined;
    const logoChanged = logoUrl !== linked?.orgLogoUrl;
    if (linked && !logoChanged && !hubFieldsDiffer(next, linked)) return;
    busy.current = true;
    void (async () => {
      try {
        // A new hub logo replaces this one; a hub with none (or one that will
        // not load) leaves what is here alone.
        const logo = logoChanged ? ((await logoFrom(logoUrl)) ?? linked?.logo) : linked?.logo;
        await syncCompany({ ...next, logo, orgLogoUrl: logoUrl });
      } finally {
        busy.current = false;
      }
    })();
  }, [loaded, org, companies, profile?.display_name, syncCompany]);

  return null;
}

/**
 * Shown in Your companies only after the live company was deleted: the way to
 * have it back. Nothing for a guest, or while it is there.
 */
export function OrgRestore() {
  const { org } = useLiveOrg();
  const companies = useAppStore((s) => s.companies);
  const syncCompany = useAppStore((s) => s.syncCompany);
  const { profile } = useProfile();
  const [, rerender] = useState(0);
  if (!org || companies.some((c) => c.orgId === org.id) || !dismissedOrgs().includes(org.id)) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-slate-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-slate-200">
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{org.name}</span> — your Universal ID company — is not in your list.
      </span>
      <button
        type="button"
        className={btnGhost}
        onClick={async () => {
          setOrgDismissed(org.id, false);
          const logo = await logoFrom(org.logo_url);
          await syncCompany({ ...companyFromOrg(org, undefined, profile?.display_name ?? '', uid), logo, orgLogoUrl: org.logo_url ?? undefined });
          rerender((n) => n + 1);
        }}
      >
        Add it back, kept in sync
      </button>
    </div>
  );
}
