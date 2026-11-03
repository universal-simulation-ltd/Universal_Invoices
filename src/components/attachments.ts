import type { Attachment } from '../lib/types';

/**
 * Files kept with a document live in IndexedDB and in the online copy, whose
 * limit is 10 MB for everything — so one file is capped well under it.
 */
export const MAX_ATTACHMENT = 5 * 1024 * 1024;

export const fileSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export async function readAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_ATTACHMENT) {
    throw new Error(`${file.name} is ${fileSize(file.size)} — files kept here can be up to ${fileSize(MAX_ATTACHMENT)}.`);
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error(`${file.name} could not be read.`));
    r.readAsDataURL(file);
  });
  return { name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl };
}

/** In a new tab, as the browser shows that kind of file. */
export function openAttachment(file: Attachment | undefined) {
  if (!file) return;
  const binary = atob(file.dataUrl.slice(file.dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: file.type }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
