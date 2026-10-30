import { describe, expect, it } from 'vitest';
import type { Dataset } from './backup';
import { exampleData } from './example';
import { hubFieldsDiffer, liveFields, companyFromOrg, type OrgDetails } from './fromOrg';
import { exportXlsx, planImport, selectionFor, toIsoDate, toNumber, toWorkbook } from './spreadsheet';
import { readXlsx, writeXlsx } from './xlsx';
import { codeFromFileName } from './picture';

/** The example, made real — the export leaves examples out — with a picture on everything. */
function realData(): Dataset {
  const { company, client, product, doc } = exampleData('2026-10-30');
  const img = { dataUrl: 'data:image/jpeg;base64,AAAA', width: 10, height: 10 };
  const real = <T extends { example?: boolean }>(x: T): T => {
    const y = { ...x };
    delete y.example;
    return y;
  };
  return {
    companies: [{ ...real(company), logo: img }],
    clients: [real(client)],
    products: [{ ...real(product), image: img }],
    documents: [{ ...real(doc), lines: doc.lines.map((l) => ({ ...l, image: img })) }],
  };
}

let n = 0;
const ids = () => `new-${++n}`;

describe('xlsx', () => {
  it('reads back what it writes: text, line breaks, numbers, yes/no, entities', () => {
    const bytes = writeXlsx([{ name: 'One', rows: [['A', 'B', 'C'], ['x & <y>\nsecond line', 1234.5, true], [null, 'é ’ €']] }]);
    const [sheet] = readXlsx(bytes);
    expect(sheet.name).toBe('One');
    expect(sheet.rows[1]).toEqual(['x & <y>\nsecond line', 1234.5, true]);
    expect(sheet.rows[2][1]).toBe('é ’ €');
    expect(sheet.rows[2][0]).toBeUndefined();
  });
  it('reads shared strings and gapped cells, as Excel saves them', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const bytes = zipSync({
      'xl/workbook.xml': strToU8('<workbook xmlns:r="r"><sheets><sheet name="Clients" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/sharedStrings.xml': strToU8('<sst><si><t>Name</t></si><si><r><t>Hel</t></r><r><t xml:space="preserve">lo </t></r></si></sst>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="3"><c r="C3" t="s"><v>1</v></c><c r="D3"><v>7</v></c></row></sheetData></worksheet>'),
    });
    const [sheet] = readXlsx(bytes);
    expect(sheet.rows[0]).toEqual(['Name']);
    expect(sheet.rows[1]).toEqual([]);
    expect(sheet.rows[2][2]).toBe('Hello ');
    expect(sheet.rows[2][3]).toBe(7);
  });
  it('says so when the file is not a spreadsheet', () => {
    expect(() => readXlsx(new TextEncoder().encode('hello'))).toThrow(/not a spreadsheet/);
  });
});

describe('spreadsheet values', () => {
  it('reads numbers however they were typed', () => {
    expect(toNumber('1 234,50')).toBe(1234.5);
    expect(toNumber('€1,234.50')).toBe(1234.5);
    expect(toNumber('1.234,50')).toBe(1234.5);
    expect(toNumber('1,234')).toBe(1234);
    expect(toNumber('12,5')).toBe(12.5);
    expect(toNumber('')).toBeUndefined();
  });
  it('reads dates as text or as an Excel serial', () => {
    expect(toIsoDate('2026-10-30')).toBe('2026-10-30');
    expect(toIsoDate('30/10/2026')).toBe('2026-10-30');
    expect(toIsoDate(46325)).toBe('2026-10-30');
  });
});

describe('spreadsheet export and import', () => {
  it('has a Read me and a sheet per kind, with words for headers and euros for prices', () => {
    const sheets = toWorkbook(realData());
    expect(sheets.map((s) => s.name)).toEqual(['Read me', 'Companies', 'Clients', 'Catalogue', 'Documents', 'Lines']);
    const cat = sheets[3];
    const price = cat.rows[1][cat.rows[0].indexOf('Unit price')];
    expect(price).toBe(realData().products[0].unitPrice / 100);
    const docs = sheets[4];
    expect(docs.rows[1][docs.rows[0].indexOf('Kind')]).toBe('Quote');
  });
  it('leaves the examples out', () => {
    const { company, client, product, doc } = exampleData('2026-10-30');
    const sheets = toWorkbook({ companies: [company], clients: [client], products: [product], documents: [doc] });
    expect(sheets.slice(1).every((s) => s.rows.length === 1)).toBe(true);
  });
  it('re-importing an unchanged export changes nothing', () => {
    const data = realData();
    const plan = planImport(data, exportXlsx(data), 1, ids);
    expect(plan).toMatchObject({ added: 0, updated: 0 });
  });
  it('imports everything into an empty account — pictures aside', () => {
    const data = realData();
    const empty: Dataset = { companies: [], clients: [], products: [], documents: [] };
    const plan = planImport(empty, exportXlsx(data), 1, ids);
    expect(plan.added).toBe(4);
    const doc = plan.write.documents[0];
    const was = data.documents[0];
    expect(doc.number).toBe(was.number);
    expect(doc.lines.map((l) => [l.description, l.quantity, l.unitPrice])).toEqual(was.lines.map((l) => [l.description, l.quantity, l.unitPrice]));
    expect(doc.companyId).toBe(data.companies[0].id);
    expect(plan.write.companies[0].logo).toBeUndefined();
    expect(plan.write.companies[0].numbering).toEqual(data.companies[0].numbering);
  });
  it('an edited cell updates that row and keeps its picture', () => {
    const data = realData();
    const sheets = toWorkbook(data);
    const cat = sheets[3];
    cat.rows[1][cat.rows[0].indexOf('Unit price')] = '2 500,00';
    const plan = planImport(data, writeXlsx(sheets), 1, ids);
    expect(plan).toMatchObject({ added: 0, updated: 1 });
    expect(plan.write.products[0].unitPrice).toBe(250000);
    expect(plan.write.products[0].image).toEqual(data.products[0].image);
  });
  it('a row with no ID is added', () => {
    const data = realData();
    const sheets = toWorkbook(data);
    const clients = sheets[2];
    clients.rows.push(['', 'New Client Ltd', '1 High Street\nLondon', 'C-9', 'a@b.c']);
    const plan = planImport(data, writeXlsx(sheets), 1, ids);
    expect(plan.added).toBe(1);
    expect(plan.write.clients[0]).toMatchObject({ name: 'New Client Ltd', address: ['1 High Street', 'London'], reference: 'C-9' });
  });
  it('a document with no company anywhere gets one from its "From" details', () => {
    const data = realData();
    const only = selectionFor(data, 'documents', [data.documents[0].id]);
    const sheets = toWorkbook({ ...only, companies: [] });
    const plan = planImport({ companies: [], clients: [], products: [], documents: [] }, writeXlsx(sheets), 1, ids);
    expect(plan.write.companies).toHaveLength(1);
    expect(plan.write.companies[0].name).toBe(data.documents[0].issuer.name);
    expect(plan.notes.length).toBe(1);
  });
  it('a company brings its documents; a document brings its company, client and catalogue items', () => {
    const data = realData();
    expect(selectionFor(data, 'companies', [data.companies[0].id]).documents).toHaveLength(1);
    const doc = selectionFor(data, 'documents', [data.documents[0].id]);
    expect([doc.companies.length, doc.clients.length, doc.products.length]).toEqual([1, 1, 1]);
    expect(selectionFor(data, 'clients', [data.clients[0].id]).documents).toHaveLength(0);
  });
  it('refuses a spreadsheet that is not one of ours', () => {
    expect(() => planImport(realData(), writeXlsx([{ name: 'Budget', rows: [['a']] }]), 1, ids)).toThrow(/none of the Companies/);
  });
});

describe('the live Universal ID company', () => {
  const org: OrgDetails = { id: 'o1', name: 'HRV', legal_name: 'HRV Simulation', address_lines: ['Laval'], bank_details: [], phone: '', logo_url: 'https://x/logo.png' };
  it('only the fields the hub has a value for are live', () => {
    expect([...liveFields(org)].sort()).toEqual(['address', 'footer', 'logo', 'name']);
  });
  it('a sync with nothing new is not a change; a hub edit is', () => {
    const c = companyFromOrg(org, undefined, 'James', () => 'c1');
    expect(hubFieldsDiffer(companyFromOrg(org, c, 'James', () => 'x'), c)).toBe(false);
    expect(hubFieldsDiffer(companyFromOrg({ ...org, address_lines: ['Paris'] }, c, 'James', () => 'x'), c)).toBe(true);
  });
});

describe('pictures to products', () => {
  it('the code is the file name less its extension', () => {
    expect(codeFromFileName('SKU-123.jpg')).toBe('SKU-123');
    expect(codeFromFileName('Arm v2.final.PNG')).toBe('Arm v2.final');
    expect(codeFromFileName('no-extension')).toBe('no-extension');
  });
});
