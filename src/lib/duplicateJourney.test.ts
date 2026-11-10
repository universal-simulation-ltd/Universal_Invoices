import { describe, expect, it } from 'vitest';
import { convertDocument, duplicateJourney } from './convert';
import { exampleData } from './example';
import { journeyOf } from './journey';
import type { Attachment, InvoiceDoc } from './types';

const file: Attachment = { name: 'po.pdf', type: 'application/pdf', size: 1, dataUrl: 'data:,' };

// A quote → proforma → invoice project, with marks on its first document.
function project() {
  const { company, doc: quote0 } = exampleData('2026-11-10');
  const quote: InvoiceDoc = {
    ...quote0,
    kind: 'quote',
    createdAt: 1,
    journey: { estimate: { state: 'skipped', at: 1 }, 'delivery-note': { state: 'uploaded', file, at: 2 } },
  };
  const a = convertDocument(quote, 'proforma', company, '2026-11-10');
  const proforma = { ...a.doc, createdAt: 2 };
  const b = convertDocument(proforma, 'invoice', a.company, '2026-11-10');
  const invoice = { ...b.doc, createdAt: 3 };
  return { company: b.company, docs: [quote, proforma, invoice] };
}

describe('duplicateJourney', () => {
  it('copies a ticked project as a new project, linked the same way', () => {
    const { company, docs } = project();
    const out = duplicateJourney(docs, [company], '2026-11-10');
    expect(out.docs.map((d) => d.kind)).toEqual(['quote', 'proforma', 'invoice']);
    const all = [...docs, ...out.docs];
    const copy = journeyOf(out.docs[2], all);
    expect(copy.root.id).toBe(out.docs[0].id);
    expect(copy.members.map((d) => d.id)).toEqual(out.docs.map((d) => d.id));
    // …and the original's journey is untouched.
    expect(journeyOf(docs[2], all).members.map((d) => d.id)).toEqual(docs.map((d) => d.id));
  });

  it('gives every copy a fresh number, and the counters run on', () => {
    const { company, docs } = project();
    const out = duplicateJourney(docs, [company], '2026-11-10');
    const numbers = new Set([...docs, ...out.docs].map((d) => d.number));
    expect(numbers.size).toBe(6);
    expect(out.companies[0].numbering.invoice.next).toBe(company.numbering.invoice.next + 1);
  });

  it('brings "not needed" marks, leaves uploads behind', () => {
    const { company, docs } = project();
    const root = duplicateJourney(docs, [company], '2026-11-10').docs[0];
    expect(root.journey).toEqual({ estimate: { state: 'skipped', at: 1 } });
  });

  it('a project ticked from the middle starts its copy there', () => {
    const { company, docs } = project();
    const out = duplicateJourney(docs.slice(1), [company], '2026-11-10');
    expect(out.docs[0].sourceId).toBeUndefined();
    expect(out.docs[1].sourceId).toBe(out.docs[0].id);
  });

  it('copies go back to draft and carry the lines', () => {
    const { company, docs } = project();
    const out = duplicateJourney(docs, [company], '2026-11-10');
    expect(out.docs.every((d) => d.status === 'draft')).toBe(true);
    expect(out.docs[2].lines.map((l) => l.description)).toEqual(docs[2].lines.map((l) => l.description));
    expect(out.docs[2].lines[0].id).not.toBe(docs[2].lines[0].id);
  });
});
