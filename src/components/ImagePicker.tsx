import { useRef, useState } from 'react';
import { imageToJpeg } from '@unisim/doc';
import type { StoredImage } from '../lib/types';
import { btnGhost } from './ui';

/**
 * Turn a chosen picture into the JPEG the PDF embeds. Done ONCE, on choosing:
 * `imageToJpeg` fills white first (so a transparent PNG logo is not black in
 * the PDF) and caps the size, and storing the result means every preview after
 * that is just a re-layout.
 */
async function toStored(file: File, maxEdge: number): Promise<StoredImage> {
  const { jpeg, width, height } = await imageToJpeg(file, 0.88, maxEdge);
  let binary = '';
  for (let i = 0; i < jpeg.length; i += 0x8000) binary += String.fromCharCode(...jpeg.subarray(i, i + 0x8000));
  return { dataUrl: `data:image/jpeg;base64,${btoa(binary)}`, width, height };
}

export default function ImagePicker({
  value,
  onChange,
  maxEdge,
  label,
  compact = false,
}: {
  value: StoredImage | undefined;
  onChange: (img: StoredImage | undefined) => void;
  /** Longest side kept, in pixels — a logo needs more than a line's thumbnail. */
  maxEdge: number;
  label: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const size = compact ? 'h-10 w-10' : 'h-20 w-36';
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white text-xs text-slate-400 hover:border-orange-400 dark:border-slate-700 dark:bg-slate-900`}
        aria-label={value ? `Change ${label}` : `Add ${label}`}
        title={value ? `Change ${label}` : `Add ${label}`}
      >
        {value ? <img src={value.dataUrl} alt="" className="h-full w-full object-contain" /> : compact ? '+' : `Add ${label}`}
      </button>
      {!compact && value && (
        <button type="button" className={btnGhost} onClick={() => onChange(undefined)}>
          Remove
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setError(null);
          try {
            onChange(await toStored(file, maxEdge));
          } catch {
            setError('That picture could not be read. Try a PNG or JPEG.');
          }
        }}
      />
    </div>
  );
}
