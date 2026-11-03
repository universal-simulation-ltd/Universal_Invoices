// A document's journey (James, 2026-11-03: "I do a quote, I see the journey
// from quote to delivery note, and if I have done them elsewhere I can
// upload, generate in platform or just manually tick / mark not needed").
//
// A journey is the documents linked by "Make… from this" (`sourceId`), walked
// from the first. Its steps are the kinds in KIND_ORDER; a step is made here
// (a document of that kind is in the journey) or marked on the first
// document (`journey`): uploaded, done elsewhere, or not needed. Pure.

import { KIND_ORDER, type BusinessDocKind, type InvoiceDoc, type JourneyMark } from './types';

export interface Journey {
  /** The first document: the one that holds the marks. */
  root: InvoiceDoc;
  /** Every document in it, oldest first. */
  members: InvoiceDoc[];
}

export type StepState = 'made' | JourneyMark['state'] | 'todo';
export interface Step {
  kind: BusinessDocKind;
  state: StepState;
  /** The documents of this kind in the journey, oldest first. */
  docs: InvoiceDoc[];
  mark?: JourneyMark;
}

export function journeyOf(doc: InvoiceDoc, documents: InvoiceDoc[]): Journey {
  const byId = new Map(documents.map((d) => [d.id, d]));
  let root = byId.get(doc.id) ?? doc;
  const seen = new Set([root.id]);
  for (let up = root.sourceId && byId.get(root.sourceId); up && !seen.has(up.id); up = up.sourceId && byId.get(up.sourceId)) {
    seen.add(up.id);
    root = up;
  }
  const members = [root];
  for (let i = 0; i < members.length; i++) {
    for (const d of documents) if (d.sourceId === members[i].id && !members.includes(d)) members.push(d);
  }
  members.sort((a, b) => a.createdAt - b.createdAt);
  return { root, members };
}

export function stepsOf({ root, members }: Journey): Step[] {
  return KIND_ORDER.map((kind) => {
    const docs = members.filter((d) => d.kind === kind);
    const mark = root.journey?.[kind];
    return { kind, docs, mark, state: docs.length ? 'made' : (mark?.state ?? 'todo') };
  });
}

/**
 * Where the journey starts: its earliest kind made or marked. The steps
 * before it are offered behind "Earlier steps" — a journey that starts with
 * a quote rarely needs an estimate.
 */
export function startOf(steps: Step[]): number {
  const i = steps.findIndex((s) => s.state !== 'todo');
  return i < 0 ? 0 : i;
}

/** The step to show first: the first one still to do after the open document's, else the open one's. */
export function nextStep(steps: Step[], open: BusinessDocKind): BusinessDocKind {
  const at = KIND_ORDER.indexOf(open);
  return steps.find((s, i) => i > at && s.state === 'todo')?.kind ?? open;
}

/** "Make it here": from the latest document BEFORE the step, else the open one. */
export function sourceFor(steps: Step[], kind: BusinessDocKind, open: InvoiceDoc): InvoiceDoc {
  const at = KIND_ORDER.indexOf(kind);
  for (let i = at - 1; i >= 0; i--) {
    const d = steps[i].docs;
    if (d.length) return d[d.length - 1];
  }
  return open;
}

/**
 * Deleting documents must not break the journeys they are in: a deleted
 * document's children are re-pointed at its own source, and a deleted first
 * document hands its marks to the next. Returns the documents that change.
 */
export function relinkAfterDelete(documents: InvoiceDoc[], ids: string[]): InvoiceDoc[] {
  const gone = new Set(ids);
  const byId = new Map(documents.map((d) => [d.id, d]));
  const next = new Map<string, InvoiceDoc>();
  const current = (id: string) => next.get(id) ?? byId.get(id)!;
  // Oldest first, so a chain of deletions passes the marks all the way down.
  for (const dead of documents.filter((d) => gone.has(d.id)).sort((a, b) => a.createdAt - b.createdAt)) {
    const was = current(dead.id);
    let source = was.sourceId;
    while (source && gone.has(source)) source = byId.get(source)?.sourceId;
    const children = documents.filter((d) => d.sourceId === dead.id).sort((a, b) => a.createdAt - b.createdAt);
    children.forEach((c, i) => {
      // With nowhere above to point at, the others follow the first child, so the journey stays one.
      const parent = source && byId.has(source) ? source : i > 0 ? children[0].id : undefined;
      const child = { ...current(c.id), sourceId: parent };
      if (!child.sourceId) delete child.sourceId;
      // The first child of a first document holds the journey's marks now.
      if (i === 0 && !source && was.journey) child.journey = { ...was.journey, ...child.journey };
      next.set(c.id, child);
    });
  }
  return [...next.values()].filter((d) => !gone.has(d.id));
}

/**
 * A list's rows put together by journey (James, 2026-11-03: "in all mode group
 * documents from the same journey"). Each journey comes once, where its newest
 * row would be — `rows` keeps its order — with its documents in journey order,
 * estimate to delivery note. `documents` is everything, so a journey whose
 * middle is filtered out of `rows` still holds together.
 */
export function groupByJourney(rows: InvoiceDoc[], documents: InvoiceDoc[]): InvoiceDoc[][] {
  const byId = new Map(documents.map((d) => [d.id, d]));
  const rootOf = (d: InvoiceDoc) => {
    let root = d;
    const seen = new Set([d.id]);
    for (let up = root.sourceId && byId.get(root.sourceId); up && !seen.has(up.id); up = up.sourceId && byId.get(up.sourceId)) {
      seen.add(up.id);
      root = up;
    }
    return root.id;
  };
  const groups = new Map<string, InvoiceDoc[]>();
  for (const d of rows) {
    const key = rootOf(d);
    const group = groups.get(key);
    if (group) group.push(d);
    else groups.set(key, [d]);
  }
  return [...groups.values()].map((g) => g.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.createdAt - b.createdAt));
}
