import { useEffect } from 'react';

/**
 * A message that needs nothing doing — "Brought in…", "Imported…", a picture
 * that would not read — shown for a few seconds at the foot of the screen and
 * gone (James, 2026-11-03: "banners like this should just act as toasts and
 * disappear after a few seconds, they don't need any actioning"). Longer
 * messages stay a little longer; a tap sends one away sooner.
 */
export default function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const ms = Math.min(9000, Math.max(4000, message.split(/\s+/).length * 300));
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]">
      <div
        role="status"
        aria-live="polite"
        onClick={onDone}
        className="pointer-events-auto max-w-lg cursor-default rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg motion-safe:animate-[toast-in_200ms_ease-out] dark:bg-slate-100 dark:text-slate-900"
      >
        {message}
      </div>
    </div>
  );
}
