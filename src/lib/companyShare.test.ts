import { describe, expect, it } from 'vitest';
import {
  buildPayload,
  companyShareUrl,
  deriveKey,
  followShared,
  forCopy,
  incomingRows,
  makeCode,
  makeSecret,
  needsCode,
  normCode,
  payloadStamp,
  receivedCompany,
  seal,
  secretFromHash,
  sharedDiffers,
  unseal,
  WrongKey,
} from './companyShare';
import { exampleData } from './example';
import { companiesOf, soldBy, withCompanies } from './soldBy';
import type { Company, Product } from './types';

const { company, client, product } = exampleData();
const mine: Company = { ...company, example: false, orgId: 'org-1', orgLogoUrl: 'https://x/logo.png' };
const item: Product = { ...product, example: false };

describe('company links', () => {
  it('makes codes in the suite format', () => {
    for (let i = 0; i < 50; i++) expect(makeCode()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/);
    expect(normCode(' ab2c-de3f ')).toBe('AB2CDE3F');
  });

  it('opens with the link alone when there is no code', async () => {
    const secret = makeSecret();
    const payload = buildPayload(mine, { products: [{ ...item, companyIds: [mine.id] }], folders: [], clients: [client] }, { catalogue: true, clients: false });
    const text = await seal(payload, await deriveKey(secret), false);
    expect(needsCode(text)).toBe(false);
    // The server sees no company name.
    expect(text).not.toContain(mine.name);
    const back = await unseal(text, await deriveKey(secret));
    expect(back.company.name).toBe(mine.name);
    expect(back.products.map((p) => p.id)).toEqual([item.id]);
    expect(back.clients).toEqual([]);
  });

  it('needs the right code when there is one, in any case and spacing', async () => {
    const secret = makeSecret();
    const code = makeCode();
    const payload = buildPayload(mine, { products: [], folders: [], clients: [] }, { catalogue: false, clients: false });
    const text = await seal(payload, await deriveKey(secret, code), true);
    expect(needsCode(text)).toBe(true);
    await expect(unseal(text, await deriveKey(secret))).rejects.toBeInstanceOf(WrongKey);
    await expect(unseal(text, await deriveKey(makeSecret(), code))).rejects.toBeInstanceOf(WrongKey);
    const typed = ` ${code.toLowerCase().replace('-', ' ')} `;
    expect((await unseal(text, await deriveKey(secret, typed))).company.name).toBe(mine.name);
  });

  it('sends none of the owner’s own ties, and the same company stamps the same', async () => {
    const withLink = { ...mine, shareLink: { id: 'row', secret: 's', catalogue: false, clients: false } };
    const payload = buildPayload(withLink, { products: [], folders: [], clients: [] }, { catalogue: false, clients: false });
    expect(payload.company).not.toHaveProperty('shareLink');
    expect(payload.company).not.toHaveProperty('orgId');
    expect(payload.company).not.toHaveProperty('orgLogoUrl');
    expect(payload.company).not.toHaveProperty('example');
    expect(await payloadStamp(payload)).toBe(await payloadStamp(buildPayload(mine, { products: [], folders: [], clients: [] }, { catalogue: false, clients: false })));
  });

  it('gives the copy its own id and numbers that cannot match the owner’s', () => {
    const owner = { ...mine, numbering: { ...mine.numbering, invoice: { pattern: 'FAC-{N:5}', next: 412 } } };
    const payload = buildPayload(owner, { products: [], folders: [], clients: [] }, { catalogue: false, clients: false });
    const copy = receivedCompany(payload, { id: 'row', key: 'k', updatedAt: 't' }, ' b.s ', () => 'new-id');
    expect(copy.id).toBe('new-id');
    expect(copy.numbering.invoice).toEqual({ pattern: 'FAC-{N:5}-BS', next: 1 });
    expect(copy.sharedFrom).toEqual({ id: 'row', key: 'k', updatedAt: 't' });
    // No initials: the owner's pattern, from 1.
    expect(receivedCompany(payload, { id: 'row', key: 'k', updatedAt: 't' }, '', () => 'x').numbering.invoice.pattern).toBe('FAC-{N:5}');
  });

  it('follows the owner’s details but keeps the recipient’s numbering, defaults and contact name', () => {
    const payload = buildPayload(mine, { products: [], folders: [], clients: [] }, { catalogue: false, clients: false });
    const copy = receivedCompany(payload, { id: 'row', key: 'k', updatedAt: 't1' }, 'BS', () => 'c');
    const tuned = { ...copy, contact: { ...copy.contact, name: 'Bradley' }, defaults: { ...copy.defaults, dueDays: 14 } };
    expect(sharedDiffers(tuned, payload)).toBe(false);
    const moved = buildPayload({ ...mine, address: ['1 New Street'], bank: ['New bank'] }, { products: [], folders: [], clients: [] }, { catalogue: false, clients: false });
    expect(sharedDiffers(tuned, moved)).toBe(true);
    const next = followShared(tuned, moved, 't2');
    expect(next.address).toEqual(['1 New Street']);
    expect(next.bank).toEqual(['New bank']);
    expect(next.contact.name).toBe('Bradley');
    expect(next.defaults.dueDays).toBe(14);
    expect(next.numbering).toEqual(copy.numbering);
    expect(next.sharedFrom?.updatedAt).toBe('t2');
  });

  it('brings new and newer catalogue rows, never one deleted here', () => {
    const a = { ...item, id: 'a', updatedAt: 1 };
    const b = { ...item, id: 'b', updatedAt: 1 };
    const c = { ...item, id: 'c', updatedAt: 1 };
    const theirs = [{ ...a, updatedAt: 2 }, { ...b, updatedAt: 1 }, c, { ...item, id: 'gone', updatedAt: 5 }];
    expect(incomingRows([a, b], theirs, new Set(['gone'])).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('puts the secret after the #, where it is not sent to the server', () => {
    const url = companyShareUrl('https://opensource.unisim.co.uk', '/invoices/', { id: 'abc_123', secret: 'S3cr-t' });
    expect(url).toBe('https://opensource.unisim.co.uk/invoices/?company=abc_123#k=S3cr-t');
    expect(secretFromHash(new URL(url).hash)).toBe('S3cr-t');
    expect(secretFromHash('')).toBeNull();
  });

  it('sends only the catalogue items ticked for this company — not another company’s, not all-companies ones', async () => {
    const other = 'other-company';
    const products = [
      { ...item, id: 'ours', folderId: 'f1', companyIds: [mine.id] },
      { ...item, id: 'both', companyIds: [mine.id, other] },
      { ...item, id: 'theirs', folderId: 'f2', companyIds: [other] },
      { ...item, id: 'everyone' },
    ];
    const folders = [{ id: 'f1', name: 'Ours', updatedAt: 1 }, { id: 'f2', name: 'Theirs', updatedAt: 1 }];
    const p = buildPayload(mine, { products, folders, clients: [] }, { catalogue: true, clients: false });
    expect(p.products.map((x) => x.id)).toEqual(['ours', 'both']);
    expect(p.products.every((x) => x.companyIds === undefined)).toBe(true);
    expect(p.folders.map((f) => f.id)).toEqual(['f1']);
    // At the other end they belong to the copy — unless already ticked there.
    expect(forCopy(p.products, 'copy').map((x) => x.companyIds)).toEqual([['copy'], ['copy']]);
    expect(forCopy(p.products, 'copy', [{ ...item, id: 'ours', companyIds: ['mine-too', 'copy'] }])[0].companyIds).toEqual(['mine-too', 'copy']);
  });
});

describe('sold by', () => {
  const companies = [{ id: 'a' }, { id: 'b' }];
  it('offers an item on its companies’ documents, and an unticked one on all', () => {
    expect(soldBy({ companyIds: ['a'] }, 'a', companies)).toBe(true);
    expect(soldBy({ companyIds: ['a'] }, 'b', companies)).toBe(false);
    expect(soldBy({}, 'b', companies)).toBe(true);
    // Its only company deleted: it is for all of them again.
    expect(soldBy({ companyIds: ['gone'] }, 'b', companies)).toBe(true);
    expect(companiesOf({ companyIds: ['gone', 'a'] }, companies)).toEqual(['a']);
  });
  it('stores none ticked as no field at all', () => {
    const row = (companyIds?: string[]): { id: string; companyIds?: string[] } => (companyIds ? { id: 'x', companyIds } : { id: 'x' });
    expect(withCompanies(row(['a']), [])).toEqual({ id: 'x' });
    expect(withCompanies(row(), ['a', 'a'])).toEqual({ id: 'x', companyIds: ['a'] });
  });
});
