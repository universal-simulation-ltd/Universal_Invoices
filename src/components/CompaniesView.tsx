import { uid } from '../lib/convert';
import { defaultNumbering, formatNumber, todayIso } from '../lib/numbering';
import { KIND_NAMES, KIND_ORDER, type Company } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import ImagePicker from './ImagePicker';
import RecordList from './RecordList';
import { DecimalInput, Field, LinesInput, inputCls, labelCls, sectionTitle, selectCls } from './ui';

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
  const { companies, documents, saveCompany, deleteCompany } = useAppStore();
  return (
    <RecordList<Company>
      rows={companies}
      noun="company"
      make={blankCompany}
      emptyText="The company your documents come from. Add more than one if you trade under more than one name."
      onSave={saveCompany}
      onDelete={deleteCompany}
      deleteWarning={(c) => {
        const n = documents.filter((d) => d.companyId === c.id).length;
        return n
          ? `Delete ${c.name}? Its ${n} document${n === 1 ? '' : 's'} stay, with the company details they were made with, but you cannot make new ones from it.`
          : `Delete ${c.name || 'this company'}?`;
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
        return (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company name" hint="Also the running header on every page.">
                <input className={inputCls} value={c.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
              </Field>
              <div>
                <span className={labelCls}>Logo</span>
                <ImagePicker value={c.logo} onChange={(logo) => set({ logo })} maxEdge={1200} label="logo" />
              </div>
              <Field label="Address">
                <LinesInput rows={5} value={c.address} onChange={(address) => set({ address })} />
              </Field>
              <div className="grid gap-3">
                <Field label="Contact name">
                  <input className={inputCls} value={c.contact.name} onChange={(e) => set({ contact: { ...c.contact, name: e.target.value } })} />
                </Field>
                <Field label="Phone">
                  <input className={inputCls} value={c.contact.phone} onChange={(e) => set({ contact: { ...c.contact, phone: e.target.value } })} />
                </Field>
                <Field label="Email">
                  <input className={inputCls} value={c.contact.email} onChange={(e) => set({ contact: { ...c.contact, email: e.target.value } })} />
                </Field>
              </div>
              <Field label="Bank details" hint="One line each: bank, BIC, IBAN.">
                <LinesInput rows={3} value={c.bank} onChange={(bank) => set({ bank })} />
              </Field>
              <Field label="Legal footer" hint="On every page. The first line prints bold — usually the registered name; then SIRET / VAT / RCS.">
                <LinesInput rows={4} value={c.footer} onChange={(footer) => set({ footer })} />
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
                <Field label="Quotes valid for (days)">
                  <DecimalInput value={d.validityDays} onChange={(v) => setDefaults({ validityDays: Math.max(0, Math.round(v ?? 0)) })} />
                </Field>
                <Field label="Invoices due after (days)">
                  <DecimalInput value={d.dueDays} onChange={(v) => setDefaults({ dueDays: Math.max(0, Math.round(v ?? 0)) })} />
                </Field>
                <Field label="Notes" className="sm:col-span-2">
                  <textarea className={`${inputCls} resize-y`} rows={2} value={d.notes} onChange={(e) => setDefaults({ notes: e.target.value })} />
                </Field>
              </div>
            </div>

            <div>
              <h3 className={sectionTitle}>Numbering</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {'{YYYY} {MM} {DD}'} are the document’s date; {'{N:5}'} is the counter, padded to five digits. “Next” is the number the next one gets.
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
          </div>
        );
      }}
    />
  );
}
