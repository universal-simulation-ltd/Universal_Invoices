import { describe, expect, it } from 'vitest';
import { computeTotals, layoutBusinessDoc } from '@unisim/doc';
import { makeBackup, mergeDataset, parseBackup } from './backup';
import { convertDocument, duplicateDocument, newDocument, pdfFileName, toBusinessDoc } from './convert';
import { exampleData } from './example';
import { companyFromOrg, hasBusinessDetails, type OrgDetails } from './fromOrg';
import { moneyInputValue, parseDecimal, parseMoney } from './money';
import { addDays, defaultNumbering, formatNumber } from './numbering';

describe('numbering', () => {
  it('reproduces the Sellsy number', () => {
    expect(formatNumber('DEV-{YYYY}{MM}{DD}-{N:5}', '2026-07-27', 406)).toBe('DEV-20260727-00406');
  });
  it('knows {YY} and an unpadded {N}', () => {
    expect(formatNumber('{YY}/{N}', '2026-01-05', 7)).toBe('26/7');
  });
  it('French defaults use the French initials', () => {
    const n = defaultNumbering('fr');
    expect(n.invoice.pattern.startsWith('FAC-')).toBe(true);
    expect(n['delivery-note'].pattern.startsWith('BL-')).toBe(true);
  });
  it('adds days across a month end without a time-zone slip', () => {
    expect(addDays('2026-07-27', 180)).toBe('2027-01-23');
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
  });
});

describe('money input', () => {
  it.each([
    ['1 234,56', 'fr', 123456],
    ['1234.56', 'en', 123456],
    ['1,234', 'en', 123400],
    ['1,5', 'en', 150],
    ['1.234', 'fr', 123400],
    ['1.234.567,89', 'en', 123456789],
    ['€50', 'en', 5000],
    ['60 000', 'fr', 6000000],
    ['-12,5', 'fr', -1250],
  ] as const)('parses %s (%s)', (text, style, minor) => {
    expect(parseMoney(text, style)).toBe(minor);
  });
  it('refuses what is not a number', () => {
    expect(parseMoney('abc', 'en')).toBeNull();
    expect(parseMoney('', 'en')).toBeNull();
  });
  it('round-trips into the box', () => {
    expect(moneyInputValue(123450, 'fr')).toBe('1234,50');
    expect(moneyInputValue(5000, 'en')).toBe('50');
    expect(parseDecimal('2,5')).toBe(2.5);
  });
});

describe('documents', () => {
  const { company, client, doc } = exampleData('2026-10-29');

  it('a new document takes the next number and advances the counter', () => {
    const before = company.numbering.invoice.next;
    const r = newDocument('invoice', company, '2026-10-29', client);
    expect(r.doc.number).toBe(`INV-20261029-${String(before).padStart(5, '0')}`);
    expect(r.company.numbering.invoice.next).toBe(before + 1);
    expect(r.doc.dueDate).toBe('2026-11-28');
    expect(r.doc.validUntil).toBeUndefined();
  });

  it('converting a quote to an invoice keeps the lines and points back', () => {
    const r = convertDocument(doc, 'invoice', company, '2026-11-02');
    expect(r.doc.kind).toBe('invoice');
    expect(r.doc.sourceId).toBe(doc.id);
    expect(r.doc.number).not.toBe(doc.number);
    expect(computeTotals(r.doc).gross).toBe(computeTotals(doc).gross);
    expect(r.doc.lines.map((l) => l.id)).not.toEqual(doc.lines.map((l) => l.id));
  });

  it('a duplicate is a fresh draft with no source', () => {
    const r = duplicateDocument({ ...doc, status: 'sent' }, company, '2026-11-02');
    expect(r.doc.status).toBe('draft');
    expect(r.doc.sourceId).toBeUndefined();
  });

  it('the example lays out as a one-page quote with VAT rows', () => {
    const pages = layoutBusinessDoc(toBusinessDoc(doc));
    expect(pages).toHaveLength(1);
    const texts = pages[0].ops.flatMap((o) => (o.op === 'text' ? [o.text] : []));
    expect(texts).toContain('VAT 20%');
    expect(texts).toContain('Total excl. tax');
  });

  it('blank address lines do not print', () => {
    const bd = toBusinessDoc({ ...doc, client: { ...doc.client, address: ['A', '', '  ', 'B'] } });
    expect(bd.client.address).toEqual(['A', 'B']);
  });

  it('names the file after the number and client, safely', () => {
    expect(pdfFileName({ ...doc, number: 'Q/1', client: { ...doc.client, name: 'A: B' } })).toBe('Q-1 - A- B.pdf');
  });
});

describe('backup', () => {
  const { company, client, product, doc } = exampleData('2026-10-29');
  const data = { companies: [company], clients: [client], products: [product], documents: [doc] };

  it('round-trips', () => {
    const back = parseBackup(JSON.stringify(makeBackup(data)));
    expect(back.documents[0].number).toBe(doc.number);
  });

  it('rejects other files and newer versions', () => {
    expect(() => parseBackup('{"app":"something-else"}')).toThrow();
    expect(() => parseBackup('not json')).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...makeBackup(data), version: 99 }))).toThrow(/newer/);
  });

  it('merges: keeps both sides, newer wins, deletes nothing', () => {
    const older = { ...client, name: 'Old name', updatedAt: client.updatedAt - 1000 };
    const newer = { ...client, name: 'New name', updatedAt: client.updatedAt + 1000 };
    const extra = { ...client, id: 'only-in-backup' };
    const r = mergeDataset({ ...data, clients: [older] }, { ...data, clients: [newer, extra] });
    expect(r.write.clients.map((c) => c.name)).toEqual(['New name', client.name]);
    expect(r.added).toBe(1);
    expect(r.updated).toBe(1);
    const same = mergeDataset(data, data);
    expect(same.added + same.updated).toBe(0);
  });
});

describe('company from the hub (platform 0318)', () => {
  const org: OrgDetails = {
    id: 'org-1',
    name: 'HRV Simulation',
    legal_name: 'HAPTIQUE ET REALITE VIRTUELLE',
    address_lines: ["Centre d'Affaires Technopolis", '', '53810 Changé', 'France'],
    vat_number: 'FR78793796806',
    registration_number: 'SIRET 79379680600032',
    phone: '+33 2 44 47 23 20',
    public_email: 'contact@example.com',
    bank_details: ['BIC : EXAMPLE', 'IBAN : FR76 0000'],
  };

  it('a fresh company takes the registered name, address, bank and a footer', () => {
    const c = companyFromOrg(org, undefined, 'James Markey', () => 'new-id');
    expect(c.id).toBe('new-id');
    expect(c.orgId).toBe('org-1');
    expect(c.name).toBe('HAPTIQUE ET REALITE VIRTUELLE');
    expect(c.address).toEqual(["Centre d'Affaires Technopolis", '53810 Changé', 'France']);
    expect(c.contact).toEqual({ name: 'James Markey', phone: '+33 2 44 47 23 20', email: 'contact@example.com' });
    expect(c.bank).toEqual(['BIC : EXAMPLE', 'IBAN : FR76 0000']);
    expect(c.footer).toEqual([
      'HAPTIQUE ET REALITE VIRTUELLE',
      "Centre d'Affaires Technopolis - 53810 Changé - France",
      'SIRET 79379680600032 - VAT FR78793796806',
      'Tel +33 2 44 47 23 20 - contact@example.com',
    ]);
  });

  it('updating keeps what the hub does not know, and the app’s own settings', () => {
    const { company } = exampleData('2026-10-29');
    const mine = { ...company, orgId: 'org-1', numbering: { ...company.numbering, invoice: { pattern: 'X-{N}', next: 42 } } };
    const c = companyFromOrg({ id: 'org-1', name: 'HRV Simulation' }, mine, 'Someone', () => 'unused');
    expect(c.id).toBe(mine.id);
    expect(c.address).toEqual(mine.address);
    expect(c.bank).toEqual(mine.bank);
    expect(c.footer).toEqual(mine.footer);
    expect(c.contact.name).toBe(mine.contact.name);
    expect(c.numbering.invoice).toEqual({ pattern: 'X-{N}', next: 42 });
    expect(c.name).toBe('HRV Simulation');
  });

  it('knows when the hub has only a name', () => {
    expect(hasBusinessDetails({ id: 'x', name: 'Only a name' })).toBe(false);
    expect(hasBusinessDetails(org)).toBe(true);
  });
});
