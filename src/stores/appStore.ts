import { create } from 'zustand';
import { move, type Target } from '../lib/arrange';
import { makeBackup, mergeDataset, parseBackup } from '../lib/backup';
import { companyForImport, companyFromRead, convertDocument, duplicateDocument, importedDocument, newDocument, uid } from '../lib/convert';
import { relinkAfterDelete } from '../lib/journey';
import { shareHooks } from '../lib/shareHooks';
import type { ReadDocument } from '../lib/readPdf';
import { exampleData } from '../lib/example';
import { exportXlsx, planImport, selectionFor } from '../lib/spreadsheet';
import type { CloudMerge } from '../lib/cloud';
import { recordDeleted } from '../lib/deletions';
import { todayIso } from '../lib/numbering';
import { getScope, loadAll, put, putMany, remove, removeMany, setScope, type Rows, type Table } from '../lib/store';
import type { Attachment, BusinessDocKind, Client, Company, Folder, InvoiceDoc, JourneyMark, Product } from '../lib/types';

export type Tab = 'documents' | 'clients' | 'catalogue' | 'companies';

interface AppState {
  loaded: boolean;
  /**
   * The Universal ID the loaded rows belong to; null = signed out. The
   * online backup and the live company act only when it is the signed-in one.
   */
  scope: string | null;
  companies: Company[];
  clients: Client[];
  products: Product[];
  /** The catalogue's folders (lib/arrange.ts). */
  folders: Folder[];
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

  /** Load an account's rows (null = signed out), first writing any edit still pending for the last one. */
  init: (account?: string | null) => Promise<void>;
  /**
   * A new account's first time here with nothing online: what was made in
   * this browser while signed out comes in with it (copied, never moved).
   * Returns how many rows came.
   */
  adoptSignedOut: () => Promise<number>;
  setTab: (tab: Tab) => void;
  open: (id: string | null) => void;
  dismissNotice: () => void;
  clearCompanyPrompt: () => void;

  saveCompany: (c: Company) => Promise<void>;
  saveClient: (c: Client) => Promise<void>;
  saveProduct: (p: Product) => Promise<void>;
  /** Several new catalogue items at once (the add-many rows, a drop of pictures). */
  addProducts: (rows: Product[]) => Promise<void>;
  /**
   * The live Universal ID company (OrgSync.tsx): saved quietly — no notice,
   * and never the "register your company first" document that saveCompany
   * makes.
   */
  syncCompany: (c: Company) => Promise<void>;
  /**
   * Two copies of the same live company (two devices each made one before
   * the online copy met): keeps the one most documents come from, moves the
   * rest of the documents onto it and deletes the others everywhere —
   * without forgetting the hub company the way a Delete does.
   */
  mergeLiveCopies: (orgId: string) => Promise<void>;
  /** "Duplicate" on a company, client or catalogue item: a copy you own — never live, never an example. Returns it. */
  duplicateRow: <K extends 'companies' | 'clients' | 'products'>(table: K, id: string) => Promise<Rows[K] | undefined>;
  /** A new folder (at the top of the catalogue) or a renamed one. */
  saveFolder: (f: Folder) => Promise<void>;
  /** Deletes the folder only: its products move out to where it was. */
  deleteFolder: (id: string) => Promise<void>;
  /** Drag and drop in the catalogue: a product or folder — or the ticked products — to a new place. */
  moveInCatalogue: (ids: string | string[], target: Target) => Promise<void>;
  /** "Delete" and "Delete selected", for every list. */
  deleteMany: (table: Table, ids: string[]) => Promise<void>;

  createDocument: (kind: BusinessDocKind, companyId?: string) => Promise<void>;
  /** Immediate in memory; written to IndexedDB a moment later (typing). */
  updateDocument: (doc: InvoiceDoc) => void;
  convert: (id: string, kind: BusinessDocKind) => Promise<void>;
  /**
   * "Import PDF": what readPdf found, as a new document from the company it
   * names (or the active one; or, with none yet, a company made from it).
   */
  importRead: (read: ReadDocument, file: Attachment | undefined, fallbackKind: BusinessDocKind, activeId?: string) => Promise<void>;
  /** A journey step done outside the app — or, with null, back to "to do". Kept on the journey's first document. */
  markStep: (rootId: string, kind: BusinessDocKind, mark: JourneyMark | null) => void;
  duplicate: (id: string) => Promise<void>;

  /**
   * "See an example" — that list's ONE example. `documents` brings its company,
   * client and catalogue item too (a quote needs them), unless real ones exist.
   */
  loadExample: (table?: Table) => Promise<void>;
  backupJson: () => string;
  restore: (text: string) => Promise<void>;
  /**
   * Everything — or, with a table and ids, that selection and what goes with
   * it (a company's documents; a document's company, client and catalogue
   * items) — as .xlsx bytes and a file name.
   */
  spreadsheet: (table?: Table, ids?: string[]) => { bytes: Uint8Array; name: string };
  /**
   * A spreadsheet from `spreadsheet()` (or one edited by hand): says what it
   * would add and update, asks, then writes. Never deletes.
   */
  importSpreadsheet: (bytes: Uint8Array, confirm: (message: string) => boolean) => Promise<void>;
  /** The online backup's state, for the menu and the footer (CloudBackup.tsx). */
  cloud: CloudState;
  setCloud: (patch: Partial<CloudState>) => void;
  /** Bring another device's changes in from the online copy. Quiet: no notice. */
  applyCloud: (merge: CloudMerge) => Promise<void>;
}

export interface CloudState {
  status: 'off' | 'signed-out' | 'loading' | 'saving' | 'saved' | 'too-large' | 'error' | 'unavailable';
  /** Epoch ms of the last upload or download that matched. */
  at: number | null;
  /** Size of the stored copy, and the account's limit (app_backup_limit()). */
  bytes: number | null;
  limit: number | null;
  message: string | null;
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

const upsert = <T extends { id: string }>(rows: T[], row: T): T[] =>
  rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row];

/**
 * Your own companies — the example does not count as having registered one.
 * The live Universal ID company comes first: it is the default "From"
 * (James, 2026-10-30: "silently create it in companies as the default").
 */
export const ownCompanies = (companies: Company[]) =>
  companies.filter((c) => !c.example).sort((a, b) => Number(!!b.orgId) - Number(!!a.orgId));

// Deleting the live company is remembered per hub company, or OrgSync would
// put it straight back. "Add it back" (OrgSync) forgets it.
const DISMISSED = 'universal-invoices:org-dismissed';
export function dismissedOrgs(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(DISMISSED) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function setOrgDismissed(orgId: string, dismissed: boolean) {
  const next = new Set(dismissedOrgs());
  if (dismissed) next.add(orgId);
  else next.delete(orgId);
  try {
    localStorage.setItem(DISMISSED, JSON.stringify([...next]));
  } catch {
    /* storage blocked — it comes back next visit, which is the safe way round */
  }
}

export const useAppStore = create<AppState>((set, get) => {
  /**
   * The example rule: the moment a REAL row of a kind exists, that kind's
   * example goes. Called after every create; a no-op once the example is gone.
   */
  async function dropExample<K extends Table>(table: K) {
    const rows = get()[table] as unknown as (Rows[K] & { example?: boolean })[];
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
    scope: null,
    companies: [],
    clients: [],
    products: [],
    folders: [],
    documents: [],
    tab: 'documents',
    openId: null,
    notice: null,
    companyPrompt: null,
    cloud: { status: 'signed-out', at: null, bytes: null, limit: null, message: null },

    init: async (account = null) => {
      // An edit typed a moment ago belongs to the account it was typed in.
      for (const [id, t] of pending) {
        clearTimeout(t);
        pending.delete(id);
        const doc = get().documents.find((d) => d.id === id);
        if (doc) await put('documents', doc);
      }
      setScope(account);
      set({ loaded: false, scope: account, openId: null, companyPrompt: null });
      const all = await loadAll();
      if (getScope() !== account) return; // switched again meanwhile
      set({ ...all, loaded: true });
    },
    adoptSignedOut: async () => {
      if (getScope() === null) return 0;
      const theirs = await loadAll(null);
      const { companies, clients, products, folders, documents } = get();
      const { write, added: n } = mergeDataset({ companies, clients, products, folders, documents }, {
        companies: theirs.companies.filter((r) => !r.example),
        clients: theirs.clients.filter((r) => !r.example),
        products: theirs.products.filter((r) => !r.example),
        folders: theirs.folders,
        documents: theirs.documents.filter((r) => !r.example),
      });
      if (!n) return 0;
      await putMany(write);
      set({
        companies: write.companies.reduce(upsert, companies),
        clients: write.clients.reduce(upsert, clients),
        products: write.products.reduce(upsert, products),
        folders: write.folders.reduce(upsert, folders),
        documents: write.documents.reduce(upsert, documents),
        notice: `What you made in this browser while signed out (${n} item${n === 1 ? '' : 's'}) is now kept on this account too.`,
      });
      return n;
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
    addProducts: async (rows) => {
      if (!rows.length) return;
      const now = Date.now();
      const fresh = rows.map((r) => ({ ...r, updatedAt: now }));
      set({ products: [...get().products, ...fresh] });
      await putMany({ companies: [], clients: [], products: fresh, documents: [] });
      await dropExample('products');
    },
    saveFolder: async (f) => {
      const next = { ...f, updatedAt: Date.now() };
      set({ folders: upsert(get().folders, next) });
      await put('folders', next);
    },
    deleteFolder: async (id) => {
      const { folders, products } = get();
      const folder = folders.find((f) => f.id === id);
      if (!folder) return;
      // Its products take the folder's place, in their order, then the folder goes.
      let rest = products;
      let moved: Product[] = [];
      for (const p of products.filter((x) => x.folderId === id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
        const change = move(rest, folders, p.id, { parent: null, before: id });
        moved = [...moved.filter((m) => !change.products.some((c) => c.id === m.id)), ...change.products];
        rest = change.products.reduce(upsert, rest);
      }
      const now = Date.now();
      const write = moved.map((p) => ({ ...p, updatedAt: now }));
      set({ products: write.reduce(upsert, products) });
      await putMany({ products: write });
      await get().deleteMany('folders', [id]);
    },
    moveInCatalogue: async (ids, target) => {
      const { products, folders } = get();
      const change = move(products, folders, ids, target);
      if (!change.products.length && !change.folders.length) return;
      const now = Date.now();
      const p = change.products.map((r) => ({ ...r, updatedAt: now }));
      const f = change.folders.map((r) => ({ ...r, updatedAt: now }));
      set({ products: p.reduce(upsert, products), folders: f.reduce(upsert, folders) });
      await putMany({ products: p, folders: f });
    },
    syncCompany: (c) => saveRow('companies', c),
    mergeLiveCopies: async (orgId) => {
      const { companies, documents } = get();
      const copies = companies.filter((c) => c.orgId === orgId);
      if (copies.length < 2) return;
      const uses = (c: Company) => documents.filter((d) => d.companyId === c.id).length;
      const [keep, ...extra] = [...copies].sort((a, b) => uses(b) - uses(a) || a.updatedAt - b.updatedAt);
      const gone = new Set(extra.map((c) => c.id));
      const now = Date.now();
      const moved = documents.filter((d) => gone.has(d.companyId)).map((d) => ({ ...d, companyId: keep.id, updatedAt: now }));
      recordDeleted('companies', [...gone]);
      set({ companies: companies.filter((c) => !gone.has(c.id)), documents: moved.reduce(upsert, documents) });
      await putMany({ documents: moved });
      await removeMany('companies', [...gone]);
    },
    duplicateRow: async (table, id) => {
      const rows = get()[table] as Rows[typeof table][];
      const source = rows.find((r) => r.id === id);
      if (!source) return undefined;
      const copy = structuredClone(source) as Rows[typeof table] & { orgId?: string; orgLogoUrl?: string; name?: string; description?: string };
      copy.id = uid();
      delete copy.example;
      delete copy.orgId;
      delete copy.orgLogoUrl;
      if (table === 'products') copy.description = `${copy.description} (copy)`;
      else copy.name = `${copy.name} (copy)`;
      await saveRow(table, copy);
      return copy;
    },

    deleteMany: async (table, ids) => {
      if (!ids.length) return;
      const gone = new Set(ids);
      // Remembered, so the online backup deletes them on other devices too.
      // The examples are the app's own and never leave the browser.
      recordDeleted(table, (get()[table] as { id: string; example?: boolean }[]).filter((r) => gone.has(r.id) && !r.example).map((r) => r.id));
      if (table === 'companies') {
        for (const c of get().companies) if (gone.has(c.id) && c.orgId) setOrgDismissed(c.orgId, true);
      }
      if (table === 'documents') {
        for (const id of ids) {
          clearTimeout(pending.get(id));
          pending.delete(id);
        }
        shareHooks.deleted?.(ids);
        // The journeys they were in stay whole.
        const relinked = relinkAfterDelete(get().documents, ids).map((d) => ({ ...d, updatedAt: Date.now() }));
        if (relinked.length) {
          set({ documents: relinked.reduce(upsert, get().documents) });
          await putMany({ documents: relinked });
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
    importRead: async (read, file, fallbackKind, activeId) => {
      const mine = ownCompanies(get().companies);
      let company = companyForImport(read, mine, mine.find((c) => c.id === activeId));
      let made = false;
      if (!company) {
        company = companyFromRead(read);
        made = true;
      }
      const { doc, company: next } = importedDocument(read, company, file, fallbackKind, todayIso());
      await added(doc, next);
      if (made) await dropExample('companies');
      set({
        notice: made
          ? `${next.name} was added to Your companies from this PDF — check its details there.`
          : null,
      });
    },
    markStep: (rootId, kind, mark) => {
      const root = get().documents.find((d) => d.id === rootId);
      if (!root) return;
      const journey = { ...root.journey };
      if (mark) journey[kind] = mark;
      else delete journey[kind];
      get().updateDocument({ ...root, journey });
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
      const { companies, clients, products, folders, documents } = get();
      return JSON.stringify(makeBackup({ companies, clients, products, folders, documents }), null, 2);
    },
    restore: async (text) => {
      const incoming = parseBackup(text);
      const { companies, clients, products, folders, documents } = get();
      const { write, added: n, updated } = mergeDataset({ companies, clients, products, folders, documents }, incoming);
      await putMany(write);
      set({
        companies: write.companies.reduce(upsert, companies),
        clients: write.clients.reduce(upsert, clients),
        products: write.products.reduce(upsert, products),
        folders: write.folders.reduce(upsert, folders),
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
    setCloud: (patch) => set({ cloud: { ...get().cloud, ...patch } }),
    applyCloud: async (merge) => {
      const s = get();
      const next = {} as Pick<AppState, 'companies' | 'clients' | 'products' | 'folders' | 'documents'>;
      for (const table of ['companies', 'clients', 'products', 'folders', 'documents'] as const) {
        const gone = new Set(merge.remove[table]);
        const rows = (s[table] as { id: string }[]).filter((r) => !gone.has(r.id));
        (next as Record<string, unknown>)[table] = (merge.write[table] as { id: string }[]).reduce(upsert, rows);
        if (gone.size) await removeMany(table, [...gone]);
      }
      await putMany(merge.write);
      const openId = s.openId && merge.remove.documents.includes(s.openId) ? null : s.openId;
      set({ ...next, openId });
      for (const table of ['companies', 'clients', 'products', 'documents'] as const) {
        if (merge.write[table].length) await dropExample(table);
      }
    },
    spreadsheet: (table, ids) => {
      const { companies, clients, products, folders, documents } = get();
      const all = { companies, clients, products, folders, documents };
      const data = table && ids ? selectionFor(all, table, ids) : all;
      // One company: named after it. Otherwise the app and the day.
      const one = table === 'companies' && ids?.length === 1 ? companies.find((c) => c.id === ids[0])?.name : undefined;
      const name = one ? `${one} — Universal Invoices ${todayIso()}.xlsx` : `Universal Invoices ${table && ids ? 'selection' : 'all'} ${todayIso()}.xlsx`;
      return { bytes: exportXlsx(data), name: name.replace(/[\\/:*?"<>|]/g, ' ') };
    },
    importSpreadsheet: async (bytes, confirm) => {
      const { companies, clients, products, folders, documents } = get();
      const plan = planImport({ companies, clients, products, folders, documents }, bytes);
      if (plan.added + plan.updated === 0) {
        set({ notice: 'Nothing to import — everything in that spreadsheet is already here.' });
        return;
      }
      const count = (t: keyof typeof plan.write, one: string, many: string) => {
        const k = plan.write[t].length;
        return k ? `${k} ${k === 1 ? one : many}` : '';
      };
      const what = [count('companies', 'company', 'companies'), count('clients', 'client', 'clients'), count('products', 'catalogue item', 'catalogue items'), count('folders', 'folder', 'folders'), count('documents', 'document', 'documents')]
        .filter(Boolean)
        .join(', ');
      const message = [
        `This spreadsheet adds ${plan.added} and updates ${plan.updated}: ${what}.`,
        ...plan.notes,
        'Nothing here is deleted. Import it?',
      ].join('\n\n');
      if (!confirm(message)) return;
      await putMany(plan.write);
      set({
        companies: plan.write.companies.reduce(upsert, companies),
        clients: plan.write.clients.reduce(upsert, clients),
        products: plan.write.products.reduce(upsert, products),
        folders: plan.write.folders.reduce(upsert, folders),
        documents: plan.write.documents.reduce(upsert, documents),
        notice: `Imported: ${plan.added} added, ${plan.updated} updated. Nothing already here was deleted.`,
      });
      for (const table of ['companies', 'clients', 'products', 'documents'] as const) {
        if (plan.write[table].length) await dropExample(table);
      }
    },
  };
});
