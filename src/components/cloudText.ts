import { formatBytes } from '../lib/cloud';
import type { CloudState } from '../stores/appStore';

const time = (ms: number) => {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const ofLimit = (c: CloudState) => (c.bytes !== null && c.limit ? `${formatBytes(c.bytes)} of ${formatBytes(c.limit)}` : '');

/** The footer's sentence. Null: say the usual "stays in this browser". */
export function cloudFooter(c: CloudState): string | null {
  switch (c.status) {
    case 'saved':
      return `Backed up to your Universal ID${c.at ? ` at ${time(c.at)}` : ''}.`;
    case 'saving':
    case 'loading':
      return 'Backing up to your Universal ID…';
    case 'too-large':
      return `Online backup paused — ${ofLimit(c) || 'over the limit'}.`;
    case 'error':
      return 'Online backup could not be reached — your work is safe in this browser.';
    default:
      return null;
  }
}

/** The Advanced menu row: label, the line under it, and what choosing it does. */
export function cloudMenu(c: CloudState): { label: string; info: string; action: 'off' | 'on' | 'retry' } | null {
  switch (c.status) {
    case 'signed-out':
    case 'unavailable':
      return null;
    case 'off':
      return { label: 'Turn on online backup', info: `Keep a copy on your Universal ID, for your other devices (up to ${c.limit ? formatBytes(c.limit) : '10 MB'})`, action: 'on' };
    case 'too-large':
      return {
        label: 'Online backup paused',
        info: `${ofLimit(c)} — remove pictures you don’t need, or ask about Enterprise for more room. Choose to try again`,
        action: 'retry',
      };
    case 'error':
      return { label: 'Online backup: retry', info: c.message ?? 'It could not be reached', action: 'retry' };
    default:
      return {
        label: 'Online backup is on',
        info: [c.at ? `Saved ${time(c.at)}` : 'Saving', ofLimit(c), 'choose to turn it off (deletes the online copy)'].filter(Boolean).join(' · '),
        action: 'off',
      };
  }
}
