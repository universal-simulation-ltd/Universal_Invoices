import { create } from 'zustand';
import { makeBackup, mergeDataset, parseBackup } from '../lib/backup';
import { convertDocument, duplicateDocument, newDocument } from '../lib/convert';
import { exampleData } from '../lib/example';
import { todayIso } from '../lib/numbering';
import { loadAll, put, putMany, remove } from '../lib/store';
import type { BusinessDocKind, Client, Company, InvoiceDoc, Product } from '../lib/types';

export type Tab = 'documents' | 'clients' | 'catalogue' | 'companies';

interface AppState {
  loaded: boolean;
  companies: Company[];
  clients: Client[];
  products: Product[];
  documents: InvoiceDoc[];
  tab: Tab;
  /** The document open in the editor, if any. */
  openId: string | null;
  notice: string | null;

  init: () => Promise<void>;
  setTab: (tab: Tab) => void;
  open: (id: string | null) => void;
  dismissNotice: () => void;

  saveCompany: (c: Company) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
  saveClient: (c: Client) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  saveProduct: (p: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  createDocument: (kind: BusinessDocKind, companyId: string) => Promise<void>;
  /** Immediate in memory; written to IndexedDB a moment later (typing). */
  updateDocument: (doc: InvoiceDoc) => void;
  deleteDocument: (id: string) => Promise<void>;
  convert: (id: string, kind: BusinessDocKind) => Promise<void>;
  duplicate: (id: string) => Promise<void>;

  loadExample: () => Promise<void>;
  backupJson: () => string;
  restore: (text: string) => Promise<void>;
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

const upsert = <T extends { id: string }>(rows: T[], row: T): T[] =>
  rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row];

export const useAppStore = create<AppState>((set, get) => ({
  loaded: false,
  companies: [],
  clients: [],
  products: [],
  documents: [],
  tab: 'documents',
  openId: null,
  notice: null,

  init: async () => {
    const all = await loadAll();
    set({ ...all, loaded: true });
  },
  setTab: (tab) => set({ tab, openId: null }),
  open: (openId) => set({ openId, tab: 'documents' }),
  dismissNotice: () => set({ notice: null }),

  saveCompany: async (c) => {
    const row = { ...c, updatedAt: Date.now() };
    set({ companies: upsert(get().companies, row) });
    await put('companies', row);
  },
  deleteCompany: async (id) => {
    set({ companies: get().companies.filter((c) => c.id !== id) });
    await remove('companies', id);
  },
  saveClient: async (c) => {
    const row = { ...c, updatedAt: Date.now() };
    set({ clients: upsert(get().clients, row) });
    await put('clients', row);
  },
  deleteClient: async (id) => {
    set({ clients: get().clients.filter((c) => c.id !== id) });
    await remove('clients', id);
  },
  saveProduct: async (p) => {
    const row = { ...p, updatedAt: Date.now() };
    set({ products: upsert(get().products, row) });
    await put('products', row);
  },
  deleteProduct: async (id) => {
    set({ products: get().products.filter((p) => p.id !== id) });
    await remove('products', id);
  },

  createDocument: async (kind, companyId) => {
    const company = get().companies.find((c) => c.id === companyId);
    if (!company) return;
    const { doc, company: next } = newDocument(kind, company, todayIso());
    set({ documents: [...get().documents, doc], companies: upsert(get().companies, next), openId: doc.id, tab: 'documents' });
    await putMany({ documents: [doc], companies: [next] });
  },
  updateDocument: (doc) => {
    const row = { ...doc, updatedAt: Date.now() };
    set({ documents: upsert(get().documents, row) });
    clearTimeout(pending.get(row.id));
    pending.set(
      row.id,
      setTimeout(() => {
        pending.delete(row.id);
        const latest = get().documents.find((d) => d.id === row.id);
        if (latest) void put('documents', latest);
      }, 400),
    );
  },
  deleteDocument: async (id) => {
    clearTimeout(pending.get(id));
    pending.delete(id);
    set({ documents: get().documents.filter((d) => d.id !== id), openId: get().openId === id ? null : get().openId });
    await remove('documents', id);
  },
  convert: async (id, kind) => {
    const source = get().documents.find((d) => d.id === id);
    const company = source && get().companies.find((c) => c.id === source.companyId);
    if (!source || !company) return;
    const { doc, company: next } = convertDocument(source, kind, company, todayIso());
    set({ documents: [...get().documents, doc], companies: upsert(get().companies, next), openId: doc.id });
    await putMany({ documents: [doc], companies: [next] });
  },
  duplicate: async (id) => {
    const source = get().documents.find((d) => d.id === id);
    const company = source && get().companies.find((c) => c.id === source.companyId);
    if (!source || !company) return;
    const { doc, company: next } = duplicateDocument(source, company, todayIso());
    set({ documents: [...get().documents, doc], companies: upsert(get().companies, next), openId: doc.id });
    await putMany({ documents: [doc], companies: [next] });
  },

  loadExample: async () => {
    const { company, client, products, doc } = exampleData();
    set({
      companies: [...get().companies, company],
      clients: [...get().clients, client],
      products: [...get().products, ...products],
      documents: [...get().documents, doc],
      openId: doc.id,
      tab: 'documents',
    });
    await putMany({ companies: [company], clients: [client], products, documents: [doc] });
  },
  backupJson: () => {
    const { companies, clients, products, documents } = get();
    return JSON.stringify(makeBackup({ companies, clients, products, documents }), null, 2);
  },
  restore: async (text) => {
    const incoming = parseBackup(text);
    const { companies, clients, products, documents } = get();
    const { write, added, updated } = mergeDataset({ companies, clients, products, documents }, incoming);
    await putMany(write);
    set({
      companies: write.companies.reduce(upsert, companies),
      clients: write.clients.reduce(upsert, clients),
      products: write.products.reduce(upsert, products),
      documents: write.documents.reduce(upsert, documents),
      notice:
        added + updated === 0
          ? 'Nothing to restore — everything in that backup is already here.'
          : `Restored: ${added} added, ${updated} updated. Nothing already here was deleted.`,
    });
  },
}));
