// A small .xlsx writer and reader — just what the spreadsheet export needs:
// several sheets of text, numbers and yes/no, a bold frozen header row and
// column widths. On fflate (the zip), not a spreadsheet library: those are a
// megabyte or carry advisories, and the format here is a few XML files.
//
// Pure (no DOM), so the tests run it in Node. The reader takes what Excel,
// LibreOffice, Numbers and Google Sheets save — shared strings, inline
// strings, numbers, booleans and formula results — and ignores styling.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type Cell = string | number | boolean | null | undefined;

export interface Sheet {
  name: string;
  rows: Cell[][];
  /** Column widths in characters; the header row's bold and frozen either way. */
  widths?: number[];
}

/** Excel's own cap on a cell's text. */
const CELL_MAX = 32767;

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters other than tab / newline are not allowed in XML 1.0.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** 0 → A, 25 → Z, 26 → AA. */
export function columnName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Styles: 0 plain, 1 bold (the header), 2 wrapped (text with line breaks).
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(sheet: Sheet): string {
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          if (v === null || v === undefined || v === '') return '';
          const ref = `${columnName(c)}${r + 1}`;
          const style = r === 0 ? ' s="1"' : typeof v === 'string' && v.includes('\n') ? ' s="2"' : '';
          if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${style}><v>${v}</v></c>` : '';
          if (typeof v === 'boolean') return `<c r="${ref}"${style} t="b"><v>${v ? 1 : 0}</v></c>`;
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(v.slice(0, CELL_MAX))}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

/** Sheet names: at most 31 characters, none of : \ / ? * [ ]. */
const sheetName = (s: string) => s.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet';

export function writeXlsx(sheets: Sheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map((s, i) => `<sheet name="${esc(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });
  return zipSync(files, { level: 6 });
}

// ── Reading ──────────────────────────────────────────────────────────────────

const unesc = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    return String.fromCodePoint(k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });

const attr = (attrs: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];

/** All the <t> text in a fragment — a plain string or rich-text runs — without phonetic guides. */
function textOf(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) out += unesc(m[1] ?? '');
  return out;
}

function file(zip: Record<string, Uint8Array>, path: string): string | undefined {
  const hit = zip[path] ?? zip[Object.keys(zip).find((k) => k.toLowerCase() === path.toLowerCase()) ?? ''];
  return hit ? strFromU8(hit) : undefined;
}

export function readXlsx(bytes: Uint8Array): Sheet[] {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(bytes);
  } catch {
    throw new Error('That file is not a spreadsheet (.xlsx).');
  }
  const workbook = file(zip, 'xl/workbook.xml');
  if (!workbook) throw new Error('That file is not an .xlsx spreadsheet.');
  const rels = file(zip, 'xl/_rels/workbook.xml.rels') ?? '';
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'Id');
    const target = attr(m[1], 'Target');
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }
  const shared: string[] = [];
  const sst = file(zip, 'xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) shared.push(textOf(m[1] ?? ''));

  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unesc(attr(m[1], 'name') ?? 'Sheet');
    const rid = attr(m[1], 'r:id') ?? /\br:id="([^"]*)"|\bid="([^"]*)"/.exec(m[1])?.slice(1).find(Boolean);
    const target = rid ? targets.get(rid) : undefined;
    const xml = target ? file(zip, `xl/${target}`) : undefined;
    if (!xml) continue;
    const rows: Cell[][] = [];
    let nextRow = 0;
    for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rowIndex = Number(attr(r[1], 'r') ?? nextRow + 1) - 1;
      nextRow = rowIndex + 1;
      const row: Cell[] = [];
      let nextCol = 0;
      for (const c of (r[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], 'r');
        const col = ref ? columnIndex(ref) : nextCol;
        nextCol = col + 1;
        const type = attr(c[1], 't');
        const body = c[2] ?? '';
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let value: Cell = null;
        if (type === 'inlineStr') value = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '');
        else if (v === undefined) value = null;
        else if (type === 's') value = shared[Number(v)] ?? '';
        else if (type === 'b') value = v.trim() === '1';
        else if (type === 'str' || type === 'e' || type === 'd') value = unesc(v);
        else {
          const n = Number(v);
          value = Number.isFinite(n) ? n : unesc(v);
        }
        row[col] = value;
      }
      rows[rowIndex] = row;
    }
    // Rows Excel skipped (blank) come back as empty arrays, so row numbers hold.
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    sheets.push({ name, rows });
  }
  return sheets;
}
