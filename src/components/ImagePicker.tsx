import { useRef, useState } from 'react';
import { PICTURE_TYPES, isPicture, toStored } from '../lib/picture';
import type { StoredImage } from '../lib/types';
import { btnGhost } from './ui';

/**
 * A picture box: click to choose, or drop a picture on it (James, 2026-10-30:
 * "Allow them to drop an image in for a specific product"). A drop here stops
 * at the box, so the Catalogue tab's "one product per picture" drop does not
 * also fire.
 */
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
  const [over, setOver] = useState(false);
  const size = compact ? 'h-10 w-10' : 'h-20 w-36';
  const take = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!isPicture(file)) {
      setError('That is not a picture this can use. Try a PNG or JPEG.');
      return;
    }
    try {
      onChange(await toStored(file, maxEdge));
    } catch {
      setError('That picture could not be read. Try a PNG or JPEG.');
    }
  };
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.stopPropagation();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          void take([...e.dataTransfer.files].find(isPicture) ?? e.dataTransfer.files[0]);
        }}
        className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-white text-center text-xs text-slate-400 hover:border-orange-400 dark:bg-slate-900 ${
          over ? 'border-orange-500 ring-2 ring-orange-300 dark:ring-orange-800' : 'border-slate-300 dark:border-slate-700'
        }`}
        aria-label={value ? `Change ${label}` : `Add ${label}`}
        title={value ? `Change ${label} — or drop a picture here` : `Add ${label} — or drop a picture here`}
      >
        {value ? <img src={value.dataUrl} alt="" className="h-full w-full object-contain" /> : compact ? '+' : `Add or drop a ${label}`}
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
        accept={PICTURE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void take(file);
        }}
      />
    </div>
  );
}
