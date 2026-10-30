import { useState } from 'react';
import { imageToJpeg } from '@unisim/doc';
import { useOrg, useProfile, useUser } from '@unisim/sdk';
import { uid } from '../lib/convert';
import { companyFromOrg, hasBusinessDetails, type OrgDetails } from '../lib/fromOrg';
import type { StoredImage } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import { btnGhost, btnPrimary } from './ui';

const HUB_DETAILS = 'https://app.unisim.co.uk/business-details';

/** The hub's logo as the JPEG the PDF embeds. Null if it cannot be read (an SVG some browsers will not decode, a host without CORS). */
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
 * "Bring in your company" — for a signed-in Universal ID with a company. The
 * Business Admin rule (2026-10-30): signing in is worth it here because the
 * company's details and branding come with it, typed once on the hub.
 * Renders nothing for a guest or an account with no company.
 */
export default function OrgImport() {
  const { org } = useOrg();
  const { user } = useUser();
  const { profile } = useProfile();
  const { companies, saveCompany } = useAppStore();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (!user || !org) return null;

  const details: OrgDetails = org;
  const linked = companies.find((c) => c.orgId === org.id);
  const filled = hasBusinessDetails(details);
  const back = encodeURIComponent(window.location.href);

  const bringIn = async () => {
    setBusy(true);
    const next = companyFromOrg(details, linked, profile?.display_name ?? '', uid);
    const logo = await logoFrom(org.logo_url);
    await saveCompany(logo ? { ...next, logo } : next);
    setBusy(false);
    setDone(linked ? 'Updated from your Universal ID company.' : `${next.name} is ready — new documents can come from it.`);
  };

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4 text-sm text-slate-800 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-slate-200">
      <p className="font-semibold">{linked ? `Linked to ${org.name}` : `Your company on Universal ID: ${org.name}`}</p>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        {filled
          ? 'Its address, VAT and registration numbers, bank details and logo come straight from the hub — type them once there, for every app.'
          : 'Add its address, VAT number and bank details on the hub once, and they come straight in here.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => void bringIn()}>
          {busy ? 'Bringing it in…' : linked ? 'Update from your company' : `Use ${org.name}`}
        </button>
        <a className={btnGhost} href={`${HUB_DETAILS}?return=${back}`}>
          {filled ? 'Change on the hub' : 'Fill in on the hub'}
        </a>
        {done && <span className="text-emerald-700 dark:text-emerald-400">{done}</span>}
      </div>
    </div>
  );
}
