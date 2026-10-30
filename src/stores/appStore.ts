import { create } from 'zustand';
import { makeBackup, mergeDataset, parseBackup } from '../lib/backup';
import { convertDocument, duplicateDocument, newDocument } from '../lib/convert';
import { exampleData } from '../lib/example';
import { todayIso } from '../lib/numbering';
import { loadAll, put, putMany, remove, removeMany, type Rows, type Table } from '../lib/store';
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
  /**
   * Set when "New …" was pressed with no company of your own: the Companies
   * tab opens its form straight away, and the document is made once it is
   * saved.
   */
  companyPrompt: BusinessDocKind | null;

  init: () => Promise<void>;
  setTab: (tab: Tab) => void;
  open: (id: string | null) => void;
  dismissNotice: () => void;
  clearCompanyPrompt: () => void;

  saveCompany: (c: Company) => Promise<void>;
  saveClient: (c: Client) => Promise<void>;
  saveProduct: (p: Product) => Promise<void>;
  /** "Delete" and "Delete selected", for every list. */
  deleteMany: (table: Table, ids: string[]) => Promise<void>;

  createDocument: (kind: BusinessDocKind, companyId?: string) => Promise<void>;
  /** Immediate in memory; written to IndexedDB a moment later (typing). */
  updateDocument: (doc: InvoiceDoc) => void;
  convert: (id: string, kind: BusinessDocKind) => Promise<void>;
  duplicate: (id: string) => Promise<void>;

  /**
   * "See an example" — that list's ONE example. `documents` brings its company,
   * client and catalogue item too (a quote needs them), unless real ones exist.
   */
  loadExample: (table?: Table) => Promise<void>;
  backupJson: () => string;
  restore: (text: string) => Promise<void>;
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

const upsert = <T extends { id: string }>(rows: T[], row: T): T[] =>
  rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row];

/** Your own companies — the example does not count as having registered one. */
export const ownCompanies = (companies: Company[]) => companies.filter((c) => !c.example);

export const useAppStore = create<AppState>((set, get) => {
  /**
   * The example rule: the moment a REAL row of a kind exists, that kind's
   * example goes. Called after every create; a no-op once the example is gone.
   */
  async function dropExample<K extends Table>(table: K) {
    const rows = get()[table] as Rows[K][];
    const examples = rows.filter((r) => r.example).map((r) => r.id);
    if (!examples.length) return;
    const openId = get().openId;
    set({
      [table]: rows.filter((r) => !r.example),
      openId: openId && examples.includes(openId) ? null : openId,
    } as Partial<AppState>);
    await removeMany(table, examples);
  }

  /** Save one row; if it is a new, real row, the example of its kind goes. */
  async function saveRow<K extends 'companies' | 'clients' | 'products'>(table: K, row: Rows[K]) {
    const rows = get()[table] as Rows[K][];
    const isNew = !rows.some((r) => r.id === row.id);
    const next = { ...row, updatedAt: Date.now() };
    set({ [table]: upsert(rows, next) } as Partial<AppState>);
    await put(table, next);
    if (isNew && !row.example) await dropExample(table);
  }

  /** A new document is in: store it with its company's advanced counter, open it, drop the example document. */
  async function added(doc: InvoiceDoc, company: Company) {
    set({ documents: [...get().documents, doc], companies: upsert(get().companies, company), openId: doc.id, tab: 'documents' });
    await putMany({ documents: [doc], companies: [company] });
    await dropExample('documents');
  }

  return {
    loaded: false,
    companies: [],
    clients: [],
    products: [],
    documents: [],
    tab: 'documents',
    openId: null,
    notice: null,
    companyPrompt: null,

    init: async () => {
      const all = await loadAll();
      set({ ...all, loaded: true });
    },
    // Leaving for another tab drops a pending "register your company first".
    setTab: (tab) => set({ tab, openId: null, companyPrompt: null }),
    open: (openId) => set({ openId, tab: 'documents' }),
    dismissNotice: () => set({ notice: null }),
    clearCompanyPrompt: () => set({ companyPrompt: null }),

    saveCompany: async (c) => {
      await saveRow('companies', c);
      // "New …" was waiting for a company: make that document now.
      const kind = get().companyPrompt;
      if (kind && !c.example) {
        set({ companyPrompt: null, notice: null });
        await get().createDocument(kind, c.id);
      }
    },
    saveClient: (c) => saveRow('clients', c),
    saveProduct: (p) => saveRow('products', p),

    deleteMany: async (table, ids) => {
      if (!ids.length) return;
      const gone = new Set(ids);
      if (table === 'documents') {
        for (const id of ids) {
          clearTimeout(pending.get(id));
          pending.delete(id);
        }
      }
      const openId = get().openId;
      set({
        [table]: (get()[table] as { id: string }[]).filter((r) => !gone.has(r.id)),
        openId: openId && gone.has(openId) ? null : openId,
      } as Partial<AppState>);
      if (ids.length === 1) await remove(table, ids[0]);
      else await removeMany(table, ids);
    },

    createDocument: async (kind, companyId) => {
      const mine = ownCompanies(get().companies);
      const company = mine.find((c) => c.id === companyId) ?? mine[0];
      if (!company) {
        // Nothing to send it from yet: register the company first.
        set({
          companyPrompt: kind,
          tab: 'companies',
          openId: null,
          notice: 'First, add the company your documents come from — its name, address and bank details go on every one. Your document opens as soon as you save it.',
        });
        return;
      }
      const { doc, company: next } = newDocument(kind, company, todayIso());
      await added(doc, next);
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
    convert: async (id, kind) => {
      const source = get().documents.find((d) => d.id === id);
      const company = source && get().companies.find((c) => c.id === source.companyId);
      if (!source || !company) return;
      const { doc, company: next } = convertDocument(source, kind, company, todayIso());
      await added(doc, next);
    },
    duplicate: async (id) => {
      const source = get().documents.find((d) => d.id === id);
      const company = source && get().companies.find((c) => c.id === source.companyId);
      if (!source || !company) return;
      const { doc, company: next } = duplicateDocument(source, company, todayIso());
      await added(doc, next);
    },

    loadExample: async (table = 'documents') => {
      const s = get();
      // One example of each kind at once: if this list has one, open/show it.
      const existing = s.documents.find((d) => d.example);
      if (table === 'documents' && existing) {
        set({ openId: existing.id, tab: 'documents' });
        return;
      }
      const { company, client, product, doc } = exampleData();
      // Only where the list has nothing of its own and no example yet — an
      // example never sits beside a real row of its kind.
      const wants = (t: Table, rows: { example?: boolean }[]) => (table === t || table === 'documents') && rows.length === 0;
      const write = {
        companies: wants('companies', s.companies) ? [company] : [],
        clients: wants('clients', s.clients) ? [client] : [],
        products: wants('products', s.products) ? [product] : [],
        documents: table === 'documents' ? [doc] : [],
      };
      set({
        companies: [...s.companies, ...write.companies],
        clients: [...s.clients, ...write.clients],
        products: [...s.products, ...write.products],
        documents: [...s.documents, ...write.documents],
        ...(table === 'documents' ? { openId: doc.id, tab: 'documents' as Tab } : {}),
      });
      await putMany(write);
    },
    backupJson: () => {
      const { companies, clients, products, documents } = get();
      return JSON.stringify(makeBackup({ companies, clients, products, documents }), null, 2);
    },
    restore: async (text) => {
      const incoming = parseBackup(text);
      const { companies, clients, products, documents } = get();
      const { write, added: n, updated } = mergeDataset({ companies, clients, products, documents }, incoming);
      await putMany(write);
      set({
        companies: write.companies.reduce(upsert, companies),
        clients: write.clients.reduce(upsert, clients),
        products: write.products.reduce(upsert, products),
        documents: write.documents.reduce(upsert, documents),
        notice:
          n + updated === 0
            ? 'Nothing to restore — everything in that backup is already here.'
            : `Restored: ${n} added, ${updated} updated. Nothing already here was deleted.`,
      });
      // A restored real row counts as making one: the examples of those kinds go.
      for (const table of ['companies', 'clients', 'products', 'documents'] as const) {
        if (write[table].some((r) => !r.example)) await dropExample(table);
      }
    },
  };
});
