import { useEffect, useId, useRef, useState } from 'react';
import { PICTURE_TYPES, isPicture, toStored } from '../lib/picture';
import type { StoredImage } from '../lib/types';
import { btnGhost, inputCls } from './ui';

/** A picture already in the app that can be picked instead of uploading one (a catalogue item's). */
export interface PictureChoice {
  id: string;
  label: string;
  image: StoredImage;
}

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
  stacked = false,
  choices,
}: {
  value: StoredImage | undefined;
  onChange: (img: StoredImage | undefined) => void;
  /** Longest side kept, in pixels — a logo needs more than a line's thumbnail. */
  maxEdge: number;
  label: string;
  compact?: boolean;
  /** Remove under the picture rather than beside it. */
  stacked?: boolean;
  /**
   * Pictures to pick from (James, 2026-11-03: "allow the user to choose item
   * images from their catalogue or upload"). Given, a click opens a menu —
   * Upload a picture, or one of these — instead of going straight to files.
   */
  choices?: PictureChoice[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState('');
  const withMenu = !!choices;

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const q = query.trim().toLowerCase();
  const shown = (choices ?? []).filter((c) => !q || c.label.toLowerCase().includes(q));
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
    <div ref={wrap} className={`relative flex gap-3 ${stacked ? 'flex-col items-start' : 'items-center'}`}>
      <button
        type="button"
        onClick={() => (withMenu ? setMenu((m) => !m) : input.current?.click())}
        aria-haspopup={withMenu ? 'dialog' : undefined}
        aria-expanded={withMenu ? menu : undefined}
        aria-controls={withMenu && menu ? menuId : undefined}
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
      {menu && (
        <div
          id={menuId}
          role="dialog"
          aria-label={`Choose a ${label}`}
          className="absolute left-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                setMenu(false);
                input.current?.click();
              }}
            >
              Upload a picture…
            </button>
            {value && (
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  setMenu(false);
                  onChange(undefined);
                }}
              >
                Remove
              </button>
            )}
          </div>
          {choices!.length > 0 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">From your catalogue</p>
              {choices!.length > 8 && <input className={inputCls} placeholder="Search the catalogue" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the catalogue" autoFocus />}
              <ul className="grid max-h-60 grid-cols-4 gap-2 overflow-y-auto">
                {shown.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      title={c.label}
                      aria-label={`Use the picture of ${c.label}`}
                      onClick={() => {
                        setMenu(false);
                        onChange(c.image);
                      }}
                      className={`flex h-14 w-full items-center justify-center overflow-hidden rounded-lg border bg-white hover:border-orange-400 dark:bg-slate-900 ${
                        value?.dataUrl === c.image.dataUrl ? 'border-orange-500 ring-2 ring-orange-300' : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <img src={c.image.dataUrl} alt="" className="h-full w-full object-contain" />
                    </button>
                  </li>
                ))}
              </ul>
              {shown.length === 0 && <p className="text-xs text-slate-500">Nothing in the catalogue matches.</p>}
            </>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">Catalogue items with a picture will show here too.</p>
          )}
        </div>
      )}
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
