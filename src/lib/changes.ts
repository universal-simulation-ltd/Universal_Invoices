// What a save changed on the PDF, to flash on the preview (James, 2026-11-03:
// "auto update pdf edit when clicking out of box, maybe highlight on pdf (and
// scroll to if needed) so they know what's happened"). Pure: two layouts in,
// boxes out.
//
// Text is compared by what it says, section by section, not by where it sits,
// so a new line that pushes the notes down flashes the line (and the totals it
// changed), not the notes. Changed text inside its section's box flashes the
// row across the section (a table row, a total); text printed outside it (the
// subject, under the addresses) flashes just itself. Rows that touch merge.

import { businessSections, widthOfText, type LayoutPage, type SectionBox } from '@unisim/doc';

const LINE = 1.25; // a text op's height, in multiples of its size
const TOUCH = 3; // rows this close (points) are one box

export function changedBoxes(before: LayoutPage[], after: LayoutPage[]): SectionBox[] {
  // What each section said before, counted, so a repeated "1" still has to be matched once each.
  const said = new Map<string, number>();
  for (const page of before) for (const op of page.ops) if (op.op === 'text' && op.section) said.set(`${op.section}\n${op.text}`, (said.get(`${op.section}\n${op.text}`) ?? 0) + 1);

  const sections = businessSections(after);
  const rows: SectionBox[] = [];
  after.forEach((page, p) => {
    for (const op of page.ops) {
      if (op.op !== 'text' || !op.section || !op.text.trim()) continue;
      const key = `${op.section}\n${op.text}`;
      const left = said.get(key) ?? 0;
      if (left > 0) {
        said.set(key, left - 1);
        continue;
      }
      const box = sections.find((b) => b.page === p && b.section === op.section);
      const w = widthOfText(op.font, op.text, op.size);
      const inside = !!box && op.x >= box.x - 1 && op.x + w <= box.x + box.width + 1;
      rows.push({ section: op.section, page: p, x: inside ? box.x : op.x, width: inside ? box.width : w, top: op.top, height: op.size * LINE });
    }
  });

  rows.sort((a, b) => a.page - b.page || a.section.localeCompare(b.section) || a.top - b.top);
  const out: SectionBox[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.page === r.page && last.section === r.section && r.top <= last.top + last.height + TOUCH) {
      const right = Math.max(last.x + last.width, r.x + r.width);
      last.x = Math.min(last.x, r.x);
      last.width = right - last.x;
      last.height = Math.max(last.height, r.top + r.height - last.top);
    } else out.push({ ...r });
  }
  return out.sort((a, b) => a.page - b.page || a.top - b.top);
}
