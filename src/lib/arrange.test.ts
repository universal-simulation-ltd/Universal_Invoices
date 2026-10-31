import { describe, expect, it } from 'vitest';
import { arrange, flatten, move, step } from './arrange';
import type { Folder, Product } from './types';

const p = (id: string, extra: Partial<Product> = {}): Product => ({ id, code: id, description: '', unit: '', unitPrice: 0, updatedAt: 0, ...extra });
const f = (id: string, extra: Partial<Folder> = {}): Folder => ({ id, name: id, updatedAt: 0, ...extra });

/** The catalogue as a string: `[F: a b] c` = folder F holding a and b, then c. */
function show(products: Product[], folders: Folder[]): string {
  return arrange(products, folders)
    .map((e) => (e.kind === 'folder' ? `[${e.folder.id}:${e.items.map((x) => ` ${x.id}`).join('')}]` : e.product.id))
    .join(' ');
}
/** Apply a move's changes. */
function apply(products: Product[], folders: Folder[], change: ReturnType<typeof move>) {
  const put = <T extends { id: string }>(rows: T[], changed: T[]) => rows.map((r) => changed.find((c) => c.id === r.id) ?? r);
  return { products: put(products, change.products), folders: put(folders, change.folders) };
}

describe('catalogue arrangement', () => {
  it('never dragged: by code, as before', () => {
    expect(show([p('c'), p('a'), p('b')], [])).toBe('a b c');
  });

  it('placed rows first, the rest after by code', () => {
    expect(show([p('c'), p('a'), p('b', { order: 0 })], [])).toBe('b a c');
  });

  it('a product in a folder that has gone sits at the top', () => {
    expect(show([p('a', { folderId: 'gone' })], [])).toBe('a');
  });

  it('reorders at the top, renumbering the level', () => {
    const products = [p('a'), p('b'), p('c')];
    const change = move(products, [], 'c', { parent: null, before: 'a' });
    const next = apply(products, [], change);
    expect(show(next.products, [])).toBe('c a b');
    expect(next.products.map((x) => x.order)).toEqual([1, 2, 0]);
  });

  it('drops into a folder, and back out', () => {
    let products = [p('a'), p('b')];
    const folders = [f('F', { order: 0 })];
    ({ products } = apply(products, folders, move(products, folders, 'a', { parent: 'F', before: null })));
    expect(show(products, folders)).toBe('[F: a] b');
    expect(products.find((x) => x.id === 'a')!.folderId).toBe('F');
    ({ products } = apply(products, folders, move(products, folders, 'a', { parent: null, before: null })));
    expect(show(products, folders)).toBe('[F:] b a');
    expect('folderId' in products.find((x) => x.id === 'a')!).toBe(false);
  });

  it('moves a folder with its products; folders do not nest', () => {
    const products = [p('a', { folderId: 'F' }), p('b')];
    const folders = [f('F'), f('G')];
    const change = move(products, folders, 'G', { parent: null, before: 'F' });
    const next = apply(products, folders, change);
    expect(show(next.products, next.folders)).toBe('[G:] [F: a] b');
    expect(move(products, folders, 'G', { parent: 'F', before: null })).toEqual({ products: [], folders: [] });
  });

  it('a drop where it already is changes nothing', () => {
    const products = [p('a', { order: 0 }), p('b', { order: 1 })];
    expect(move(products, [], 'a', { parent: null, before: 'b' })).toEqual({ products: [], folders: [] });
    expect(move(products, [], 'a', { parent: null, before: 'a' })).toEqual({ products: [], folders: [] });
  });

  it('flattens folder by folder, for selecting and the spreadsheet', () => {
    const products = [p('a', { folderId: 'F' }), p('b', { order: 0 })];
    expect(flatten(arrange(products, [f('F', { order: 1 })])).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('the keyboard steps one place, and out of a folder at its edge', () => {
    const products = [p('a', { folderId: 'F', order: 0 }), p('b', { folderId: 'F', order: 1 }), p('c', { order: 1 })];
    const folders = [f('F', { order: 0 })];
    expect(step(products, folders, 'b', -1)).toEqual({ parent: 'F', before: 'a' });
    expect(step(products, folders, 'a', -1)).toEqual({ parent: null, before: 'F' });
    expect(step(products, folders, 'b', 1)).toEqual({ parent: null, before: 'c' });
    expect(step(products, folders, 'c', 1)).toBeNull();
    expect(step(products, folders, 'c', -1)).toEqual({ parent: null, before: 'F' });
  });
});
