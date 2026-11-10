// Versions of a document to go back to (James, 2026-11-10: "I make some
// changes to the proforma, I then want to rewind to before my changes. I don't
// want a save every single modification. Maybe each time you click download
// pdf / share it makes a snapshot"). Pure: each function takes a document and
// gives back the next one.
//
// A version keeps what the editor's form edits (VERSIONED_FIELDS), never the
// journey marks, attachments or signed copy: those record what happened, not
// what the document said. Line pictures are kept once each in
// `versionImages`, so twenty versions of a page of photos don't hold twenty
// copies of every photo.

import { computeTotals } from '@unisim/doc';
import { pdfFingerprint, uid } from './convert';
import { VERSIONED_FIELDS, type DocVersion, type InvoiceDoc, type StoredImage, type VersionData, type VersionReason } from './types';

/** Automatic versions kept; the oldest automatic one goes first. Named ones stay until removed. */
export const AUTO_KEPT = 20;

const AUTO: VersionReason[] = ['download', 'share', 'sign', 'convert', 'restore'];

function imageKey(img: StoredImage): string {
  let h = 0x811c9dc5;
  const t = img.dataUrl;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193) >>> 0;
  return `${h.toString(36)}-${t.length}`;
}

/** Drop pictures no version uses any more. */
function tidyImages(doc: InvoiceDoc): InvoiceDoc {
  const used = new Set((doc.versions ?? []).flatMap((v) => v.data.lines.flatMap((l) => (l.imageRef ? [l.imageRef] : []))));
  const images = Object.fromEntries(Object.entries(doc.versionImages ?? {}).filter(([k]) => used.has(k)));
  const rest = { ...doc };
  delete rest.versionImages;
  return Object.keys(images).length ? { ...rest, versionImages: images } : rest;
}

/**
 * The document with a version of how it reads now added. An automatic one is
 * skipped when the newest version is already this exact document — Download
 * twice is one version. `name` makes it a kept, named version.
 */
export function withVersion(doc: InvoiceDoc, reason: VersionReason, name?: string, at = Date.now()): InvoiceDoc {
  const fingerprint = pdfFingerprint(doc);
  const versions = doc.versions ?? [];
  const last = versions[versions.length - 1];
  if (reason !== 'manual' && last?.fingerprint === fingerprint) return doc;

  const images = { ...(doc.versionImages ?? {}) };
  const data = Object.fromEntries(VERSIONED_FIELDS.map((k) => [k, structuredClone(doc[k])])) as unknown as VersionData;
  data.lines = doc.lines.map(({ image, ...line }) => {
    if (!image) return line;
    const key = imageKey(image);
    images[key] = image;
    return { ...line, imageRef: key };
  });
  const version: DocVersion = {
    id: uid(),
    at,
    reason,
    ...(name?.trim() ? { name: name.trim() } : {}),
    fingerprint,
    total: computeTotals(doc).gross,
    currency: doc.currency,
    data,
  };
  let next = [...versions, version];
  // Over the limit: the oldest automatic versions go; named ones never do.
  let autos = next.filter((v) => AUTO.includes(v.reason) && !v.name).length;
  next = next.filter((v) => {
    if (autos <= AUTO_KEPT || !AUTO.includes(v.reason) || v.name) return true;
    autos--;
    return false;
  });
  return tidyImages({ ...doc, versions: next, versionImages: images });
}

/** The document as it read in `version`: for viewing its PDF, and what Restore writes. */
export function asVersion(doc: InvoiceDoc, version: DocVersion): InvoiceDoc {
  const { lines, ...fields } = structuredClone(version.data);
  return {
    ...doc,
    ...fields,
    lines: lines.map(({ imageRef, ...line }) => {
      const image = imageRef ? doc.versionImages?.[imageRef] : undefined;
      return image ? { ...line, image } : line;
    }),
  };
}

/** Go back to `id`. How it read just before is saved first, so a restore can be undone too. */
export function restoreVersion(doc: InvoiceDoc, id: string): InvoiceDoc {
  const version = doc.versions?.find((v) => v.id === id);
  if (!version) return doc;
  const kept = withVersion(doc, 'restore');
  return asVersion(kept, version);
}

export function removeVersion(doc: InvoiceDoc, id: string): InvoiceDoc {
  const versions = (doc.versions ?? []).filter((v) => v.id !== id);
  const rest = { ...doc };
  delete rest.versions;
  return tidyImages(versions.length ? { ...rest, versions } : rest);
}
