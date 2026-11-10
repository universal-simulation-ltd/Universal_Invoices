import { describe, expect, it } from 'vitest';
import { exampleData } from './example';
import type { InvoiceDoc, StoredImage } from './types';
import { AUTO_KEPT, asVersion, removeVersion, restoreVersion, withVersion } from './versions';

const picture: StoredImage = { dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(5000), width: 10, height: 10 } as StoredImage;
const base = (): InvoiceDoc => {
  const { doc } = exampleData('2026-11-10');
  return { ...doc, lines: doc.lines.map((l, i) => (i === 0 ? { ...l, image: picture } : l)) };
};
const edit = (doc: InvoiceDoc, notes: string): InvoiceDoc => ({ ...doc, notes });

describe('versions', () => {
  it('a download saves how the document reads; downloading again unchanged adds nothing', () => {
    const a = withVersion(base(), 'download');
    expect(a.versions).toHaveLength(1);
    expect(withVersion(a, 'download').versions).toHaveLength(1);
    expect(withVersion(edit(a, 'changed'), 'share').versions).toHaveLength(2);
  });

  it('a version saved by hand is always added, with its name', () => {
    const a = withVersion(withVersion(base(), 'download'), 'manual', '  Before the USD change ');
    expect(a.versions!.map((v) => v.name)).toEqual([undefined, 'Before the USD change']);
  });

  it('restore brings the old text back and keeps how it read just before, so it can be undone', () => {
    const v1 = withVersion(edit(base(), 'first'), 'download');
    const now = edit(v1, 'second');
    const back = restoreVersion(now, v1.versions![0].id);
    expect(back.notes).toBe('first');
    expect(back.versions!.map((v) => v.reason)).toEqual(['download', 'restore']);
    const undone = restoreVersion(back, back.versions![1].id);
    expect(undone.notes).toBe('second');
  });

  it('a picture is kept once, however many versions show it, and comes back on restore', () => {
    let doc = base();
    for (let i = 0; i < 5; i++) doc = withVersion(edit(doc, `n${i}`), 'download');
    expect(Object.keys(doc.versionImages!)).toHaveLength(1);
    expect(JSON.stringify(doc.versions).includes('AAAAAAAAAA')).toBe(false);
    const noPicture = { ...doc, lines: doc.lines.map((l) => ({ ...l, image: undefined })) };
    expect(asVersion(noPicture, doc.versions![0]).lines[0].image?.dataUrl).toBe(picture.dataUrl);
  });

  it(`keeps the newest ${AUTO_KEPT} automatic versions and every named one`, () => {
    let doc = withVersion(base(), 'manual', 'Keep me');
    for (let i = 0; i < AUTO_KEPT + 5; i++) doc = withVersion(edit(doc, `n${i}`), 'download');
    expect(doc.versions!.filter((v) => !v.name)).toHaveLength(AUTO_KEPT);
    expect(doc.versions![0].name).toBe('Keep me');
    expect(doc.versions![doc.versions!.length - 1].data.notes).toBe(`n${AUTO_KEPT + 4}`);
  });

  it('removing the last version that used a picture drops the picture', () => {
    const a = withVersion(base(), 'download');
    const gone = removeVersion(a, a.versions![0].id);
    expect(gone.versions).toBeUndefined();
    expect(gone.versionImages).toBeUndefined();
  });

  it('records the total and currency for the list', () => {
    const doc = base();
    const v = withVersion(doc, 'download').versions![0];
    expect(v.currency).toBe(doc.currency);
    expect(v.total).toBeGreaterThan(0);
  });
});
