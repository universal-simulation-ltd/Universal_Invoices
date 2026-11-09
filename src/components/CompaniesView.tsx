import { GrowingTextarea } from '@unisim/sdk';
import { uid } from '../lib/convert';
import { defaultNumbering, formatNumber, todayIso } from '../lib/numbering';
import { KIND_NAMES, KIND_ORDER, type BankAccount, type Company } from '../lib/types';
import { ownCompanies, useAppStore } from '../stores/appStore';
import { useActiveCompany } from './activeCompany';
import ImagePicker from './ImagePicker';
import FromBefore from './FromBefore';
import { HUB_DETAILS, OrgRestore, useLiveOrg } from './OrgSync';
import { CompanySharePanel } from './CompanyShare';
import { saveSpreadsheet } from './exportSheet';
import RecordList from './RecordList';
import { DecimalInput, Field, LinesInput, SyncedChip, btnGhost, inputCls, labelCls, liveInputCls, sectionTitle, selectCls } from './ui';

const EXPORT_NOTE_FR = 'Exonération de TVA, art. 262 I du CGI';

function blankCompany(): Company {
  return {
    id: uid(),
    name: '',
    address: [],
    contact: { name: '', phone: '', email: '' },
    bank: [],
    footer: [],
    defaults: {
      language: 'en',
      numberStyle: 'en',
      currency: 'EUR',
      taxMode: 'export-exempt',
      taxNote: EXPORT_NOTE_FR,
      taxRate: 20,
      paymentTerms: '',
      notes: '',
      validityDays: 180,
      dueDays: 30,
    },
    numbering: defaultNumbering('en'),
    updatedAt: Date.now(),
  };
}

export default function CompaniesView() {
  const { companies, documents, saveCompany, deleteMany, loadExample, companyPrompt, duplicateRow } = useAppStore();
  const { org, liveFor } = useLiveOrg();
  const { active, setActive } = useActiveCompany();
  const mine = ownCompanies(companies);
  return (
    <div className="space-y-4">
    <OrgRestore />
    <FromBefore />
    <RecordList<Company>
      rows={companies}
      noun="company"
      addBelow
      make={blankCompany}
      emptyText="The company your documents come from. Add more than one if you trade under more than one name."
      // The link fields are not in the form: whatever the stored row has now
      // (a link made while the form was open, a copy brought up to date) stays.
      onSave={(c) => {
        const stored = companies.find((x) => x.id === c.id);
        const draft = { ...c, shareLink: stored?.shareLink, sharedFrom: stored?.sharedFrom };
        if (!draft.shareLink) delete draft.shareLink;
        if (!draft.sharedFrom) delete draft.sharedFrom;
        return saveCompany(draft);
      }}
      canSave={(c) => c.name.trim() !== ''}
      onDelete={(ids) => deleteMany('companies', ids)}
      onExample={() => void loadExample('companies')}
      onExport={(ids) => saveSpreadsheet('companies', ids)}
      onDuplicate={(c) => duplicateRow('companies', c.id)}
      live={(c) => liveFor(c).size > 0}
      // The active company is the one new documents come from (activeCompany.ts).
      aside={(c) =>
        c.example ? null : c.id === active?.id ? (
          <span
            className="rounded-full bg-orange-600 px-3 py-1 text-xs font-semibold text-white"
            title="New documents come from this company"
          >
            Active
          </span>
        ) : mine.length > 1 ? (
          <button
            type="button"
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:border-orange-400 hover:text-orange-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-orange-400"
            onClick={() => setActive(c.id)}
          >
            Make active
          </button>
        ) : null
      }
      // "New …" with no company of your own lands here with the form open.
      startNew={companyPrompt !== null}
      deleteWarning={(c) => {
        const n = documents.filter((d) => d.companyId === c.id).length;
        const base = n
          ? `Delete ${c.name}? Its ${n} document${n === 1 ? '' : 's'} stay, with the company details they were made with, but you cannot make new ones from it.`
          : `Delete ${c.name || 'this company'}?`;
        // The live one: say it will not come back by itself.
        if (c.orgId && liveFor(c).size) return `${base} It stops following your Universal ID company; you can add it back from this tab.`;
        if (c.shareLink) return `${base} Its link stops working too. Whoever added it from the link keeps their copy.`;
        return base;
      }}
      summary={(c) => (
        <div className="flex items-center gap-4">
          {c.logo ? <img src={c.logo.dataUrl} alt="" className="h-12 w-20 shrink-0 object-contain" /> : null}
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-slate-100">{c.name || 'Unnamed company'}</div>
            <div className="truncate text-sm text-slate-500 dark:text-slate-400">{c.address.filter(Boolean).join(', ')}</div>
          </div>
        </div>
      )}
      form={(c, set) => {
        const d = c.defaults;
        const setDefaults = (patch: Partial<Company['defaults']>) => set({ defaults: { ...d, ...patch } });
        // Fields the hub fills in follow it: read-only and tinted. The rest —
        // and all of it signed out — is yours to type.
        const lf = liveFor(c);
        const text = (live: boolean, value: string, onChange: (v: string) => void, autoFocus = false) =>
          live ? (
            <input className={liveInputCls} value={value} readOnly />
          ) : (
            <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} />
          );
        const back = encodeURIComponent(window.location.href);
        return (
          <div className="space-y-6">
            {c.sharedFrom && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-sm text-slate-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-slate-300">
                {c.sharedFrom.ended ? (
                  <span className="min-w-0 flex-1">
                    Shared with you by link. Its owner has stopped sharing it, so it no longer changes by itself — it is yours to edit.
                  </span>
                ) : (
                  <>
                    <SyncedChip />
                    <span className="min-w-0 flex-1">
                      Shared with you by link: the tinted boxes follow its owner’s changes. The documents you make from it stay with you — its owner does not see them.
                    </span>
                  </>
                )}
              </div>
            )}
            {lf.size > 0 && org && c.orgId === org.id && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-sm text-slate-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-slate-300">
                <SyncedChip />
                <span className="min-w-0 flex-1">
                  The tinted boxes follow <span className="font-semibold">{org.name}</span> on your Universal ID and update by themselves. Want a version that stays put? Duplicate it.
                </span>
                <a className="font-semibold text-sky-800 hover:underline dark:text-sky-300" href={`${HUB_DETAILS}?return=${back}`}>
                  Change on the hub →
                </a>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company name" hint="Required. Also the running header on every page.">
                {text(lf.has('name'), c.name, (name) => set({ name }), true)}
              </Field>
              <div>
                <span className={labelCls}>Logo</span>
                {lf.has('logo') ? (
                  <div className="flex h-24 items-center justify-center rounded-lg border border-sky-200 bg-sky-50/80 p-2 dark:border-sky-900/70 dark:bg-sky-950/30">
                    {c.logo ? <img src={c.logo.dataUrl} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-500">Loading the hub’s logo…</span>}
                  </div>
                ) : (
                  <ImagePicker value={c.logo} onChange={(logo) => set({ logo })} maxEdge={1200} label="logo" />
                )}
              </div>
              <Field label="Address">
                <LinesInput rows={5} value={c.address} onChange={(address) => set({ address })} live={lf.has('address')} />
              </Field>
              <div className="grid gap-3">
                <Field label="Contact name">
                  <input className={inputCls} value={c.contact.name} onChange={(e) => set({ contact: { ...c.contact, name: e.target.value } })} />
                </Field>
                <Field label="Phone">
                  {text(lf.has('phone'), c.contact.phone, (phone) => set({ contact: { ...c.contact, phone } }))}
                </Field>
                <Field label="Email">
                  {text(lf.has('email'), c.contact.email, (email) => set({ contact: { ...c.contact, email } }))}
                </Field>
              </div>
              <h3 className={`${sectionTitle} pt-3 sm:col-span-2`}>Bank and legal</h3>
              {/* The main account, and more to pick per document in its From section — kept together. */}
              <div className="space-y-3">
              <Field label="Bank details" hint="One line each: bank, BIC, IBAN. The account documents use unless you pick another.">
                <LinesInput rows={3} value={c.bank} onChange={(bank) => set({ bank })} live={lf.has('bank')} />
              </Field>
                {(c.moreBanks ?? []).map((b, i) => {
                  const update = (patch: Partial<BankAccount>) => set({ moreBanks: (c.moreBanks ?? []).map((x, n) => (n === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={b.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <input className={inputCls} value={b.label} placeholder="Name it — USD account, Barclays…" aria-label="Account name" onChange={(e) => update({ label: e.target.value })} />
                        <button type="button" className={btnGhost} onClick={() => set({ moreBanks: (c.moreBanks ?? []).filter((_, n) => n !== i) })}>
                          Remove
                        </button>
                      </div>
                      <LinesInput rows={3} value={b.lines} onChange={(lines) => update({ lines })} placeholder={'Bank\nBIC : …\nIBAN : …'} />
                    </div>
                  );
                })}
                <button type="button" className={btnGhost} onClick={() => set({ moreBanks: [...(c.moreBanks ?? []), { id: uid(), label: '', lines: [] }] })}>
                  + Another bank account
                </button>
              </div>
              <Field label="Legal footer" hint={lf.has('footer') ? 'Made from the hub’s registered name, address, numbers and contact details.' : 'On every page. The first line prints bold — usually the registered name; then SIRET / VAT / RCS.'}>
                <LinesInput rows={4} value={c.footer} onChange={(footer) => set({ footer })} live={lf.has('footer')} />
              </Field>
            </div>

            <div>
              <h3 className={sectionTitle}>New documents start with</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Language">
                  <select className={selectCls} value={d.language} onChange={(e) => setDefaults({ language: e.target.value as Company['defaults']['language'] })}>
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                  </select>
                </Field>
                <Field label="Numbers look like">
                  <select className={selectCls} value={d.numberStyle} onChange={(e) => setDefaults({ numberStyle: e.target.value as Company['defaults']['numberStyle'] })}>
                    <option value="fr">163 000,00 €</option>
                    <option value="en">€163,000.00</option>
                  </select>
                </Field>
                <Field label="Currency">
                  <select className={selectCls} value={d.currency} onChange={(e) => setDefaults({ currency: e.target.value as Company['defaults']['currency'] })}>
                    <option value="EUR">Euro (€)</option>
                    <option value="GBP">Pound sterling (£)</option>
                    <option value="USD">US dollar ($)</option>
                  </select>
                </Field>
                <Field label="Tax">
                  <select className={selectCls} value={d.taxMode} onChange={(e) => setDefaults({ taxMode: e.target.value as Company['defaults']['taxMode'] })}>
                    <option value="export-exempt">No VAT — export</option>
                    <option value="reverse-charge">No VAT — reverse charge</option>
                    <option value="standard">VAT on each line</option>
                  </select>
                </Field>
                {d.taxMode === 'standard' ? (
                  <Field label="VAT rate %">
                    <DecimalInput value={d.taxRate} onChange={(v) => setDefaults({ taxRate: v ?? 0 })} />
                  </Field>
                ) : (
                  <Field label="Exemption wording" className="sm:col-span-2">
                    <input className={inputCls} value={d.taxNote} onChange={(e) => setDefaults({ taxNote: e.target.value })} />
                  </Field>
                )}
                <Field label="Payment terms" className="sm:col-span-2">
                  <input className={inputCls} value={d.paymentTerms} placeholder="à la commande, 30 days…" onChange={(e) => setDefaults({ paymentTerms: e.target.value })} />
                </Field>
                <Field label="Quotes valid for (days)" hint={d.validityDays <= 0 ? 'At 0, a new quote expires the day it is dated — its Valid until will be warned about.' : undefined}>
                  <DecimalInput value={d.validityDays} onChange={(v) => setDefaults({ validityDays: Math.max(0, Math.round(v ?? 0)) })} />
                </Field>
                <Field label="Invoices due after (days)">
                  <DecimalInput value={d.dueDays} onChange={(v) => setDefaults({ dueDays: Math.max(0, Math.round(v ?? 0)) })} />
                </Field>
                <Field label="Notes" className="sm:col-span-2">
                  <GrowingTextarea className={`${inputCls} resize-y`} rows={2} value={d.notes} onChange={(e) => setDefaults({ notes: e.target.value })} />
                </Field>
              </div>
            </div>

            <div>
              <h3 className={sectionTitle}>Numbering</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {'{YYYY} {MM} {DD}'} are the document’s date; {'{N}'} is the counter ({'{N:5}'} pads it to five digits). “Next” is the number the next one gets.
              </p>
              <div className="mt-3 space-y-2">
                {KIND_ORDER.map((k) => {
                  const n = c.numbering[k];
                  const setN = (patch: Partial<typeof n>) => set({ numbering: { ...c.numbering, [k]: { ...n, ...patch } } });
                  return (
                    <div key={k} className="grid grid-cols-[7rem_minmax(0,1fr)_5rem] items-center gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_6rem_minmax(0,1fr)]">
                      <span className="text-sm text-slate-700 dark:text-slate-300">{KIND_NAMES[k]}</span>
                      <input className={inputCls} value={n.pattern} onChange={(e) => setN({ pattern: e.target.value })} aria-label={`${KIND_NAMES[k]} number pattern`} />
                      <DecimalInput value={n.next} onChange={(v) => setN({ next: Math.max(1, Math.round(v ?? 1)) })} ariaLabel={`Next ${KIND_NAMES[k]} number`} />
                      <span className="col-span-3 truncate text-xs text-slate-500 sm:col-span-1">→ {formatNumber(n.pattern, todayIso(), n.next)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* A saved company of your own can be shared by link (CompanyShare.tsx). */}
            <CompanySharePanel companyId={c.id} />
          </div>
        );
      }}
    />
    </div>
  );
}
