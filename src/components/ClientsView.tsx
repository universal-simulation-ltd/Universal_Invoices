import { uid } from '../lib/convert';
import type { Client } from '../lib/types';
import { useAppStore } from '../stores/appStore';
import RecordList from './RecordList';
import { Field, LinesInput, inputCls } from './ui';

export default function ClientsView() {
  const { clients, saveClient, deleteMany, loadExample } = useAppStore();
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <RecordList<Client>
      rows={sorted}
      noun="client"
      make={() => ({ id: uid(), name: '', address: [], reference: '', email: '', updatedAt: Date.now() })}
      emptyText="Save the people and companies you send documents to, so a new quote is one choice away."
      onSave={saveClient}
      onDelete={(ids) => deleteMany('clients', ids)}
      onExample={() => void loadExample('clients')}
      deleteWarning={(c) => `Delete ${c.name || 'this client'}? Documents already made for them keep their copy of the address.`}
      summary={(c) => (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-slate-100">{c.name || 'Unnamed client'}</div>
            <div className="truncate text-sm text-slate-500 dark:text-slate-400">{c.address.filter(Boolean).join(', ')}</div>
          </div>
          {c.reference && <span className="text-xs text-slate-500">No. {c.reference}</span>}
        </div>
      )}
      form={(c, set) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input className={inputCls} value={c.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
          </Field>
          <Field label="Client no." hint="Their number in your books — printed on documents.">
            <input className={inputCls} value={c.reference} onChange={(e) => set({ reference: e.target.value })} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <LinesInput rows={4} value={c.address} onChange={(address) => set({ address })} placeholder={'Street\nPostcode City\nCountry'} />
          </Field>
          <Field label="Email">
            <input type="email" className={inputCls} value={c.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
        </div>
      )}
    />
  );
}
