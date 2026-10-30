import { imageToJpeg } from '@unisim/doc';
import type { StoredImage } from './types';

/**
 * Turn a chosen picture into the JPEG the PDF embeds. Done ONCE, on choosing:
 * `imageToJpeg` fills white first (so a transparent PNG logo is not black in
 * the PDF) and caps the size, and storing the result means every preview after
 * that is just a re-layout.
 */
export async function toStored(file: File, maxEdge: number): Promise<StoredImage> {
  const { jpeg, width, height } = await imageToJpeg(file, 0.88, maxEdge);
  let binary = '';
  for (let i = 0; i < jpeg.length; i += 0x8000) binary += String.fromCharCode(...jpeg.subarray(i, i + 0x8000));
  return { dataUrl: `data:image/jpeg;base64,${btoa(binary)}`, width, height };
}

/** A file the picture boxes take: what the browser can decode into the PDF's JPEG. */
export const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const isPicture = (f: File) => PICTURE_TYPES.includes(f.type) || /\.(png|jpe?g|webp|gif)$/i.test(f.name);

/** "SKU-123.final.jpg" → "SKU-123.final": the file name, less its extension, as a product code. */
export const codeFromFileName = (name: string) => name.replace(/\.[^./\\]+$/, '').trim();
