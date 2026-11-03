import { describe, expect, it } from 'vitest';
import { layoutBusinessDoc } from '@unisim/doc';
import { changedBoxes } from './changes';
import { clientSnapshot, toBusinessDoc } from './convert';
import { exampleData } from './example';
import type { InvoiceDoc } from './types';

describe('what a save changed on the PDF', () => {
  const { client, doc: base } = exampleData('2026-10-29');
  const doc: InvoiceDoc = { ...base, client: clientSnapshot(client), notes: 'Thanks for your business.' };
  const layout = (d: InvoiceDoc) => layoutBusinessDoc(toBusinessDoc(d));

  it('is nothing when nothing changed', () => {
    expect(changedBoxes(layout(doc), layout(doc))).toEqual([]);
  });

  it('flashes the notes, and only the notes, for new notes', () => {
    const boxes = changedBoxes(layout(doc), layout({ ...doc, notes: 'Delivery within 30 days.' }));
    expect(boxes.map((b) => b.section)).toEqual(['notes']);
  });

  it('flashes the subject where it is printed, not across its section', () => {
    const [box] = changedBoxes(layout(doc), layout({ ...doc, subject: 'Autumn term' }));
    const subject = layout(doc)[0].ops.find((o) => o.op === 'text' && o.text.includes('Training programme'));
    expect(box.x).toBeCloseTo(subject!.x, 0);
  });

  it('flashes the line and the totals a new quantity changes, not what it moved', () => {
    const more = { ...doc, lines: doc.lines.map((l, i) => (i === 0 ? { ...l, quantity: l.quantity + 2 } : l)) };
    const sections = new Set(changedBoxes(layout(doc), layout(more)).map((b) => b.section));
    expect(sections).toEqual(new Set(['lines', 'totals']));
  });
});
