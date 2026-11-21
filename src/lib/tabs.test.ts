import { describe, expect, it } from 'vitest';
import { homeFallback, moveTab, normaliseHidden, normaliseOrder, shownTabs, TAB_VALUES } from './tabs';

describe('tab order', () => {
  it('starts with Your companies', () => {
    expect(normaliseOrder(null)).toEqual(['companies', 'documents', 'clients', 'catalogue']);
  });
  it('keeps a stored order, drops what it does not know and adds what is missing', () => {
    expect(normaliseOrder(['catalogue', 'nope', 'clients', 'clients'])).toEqual(['catalogue', 'clients', 'companies', 'documents']);
    expect(normaliseOrder('garbage')).toEqual(TAB_VALUES);
  });
  it('moves a tab to a place', () => {
    expect(moveTab(['companies', 'documents', 'clients', 'catalogue'], 'catalogue', 0)).toEqual(['catalogue', 'companies', 'documents', 'clients']);
    expect(moveTab(['companies', 'documents', 'clients', 'catalogue'], 'companies', 9)).toEqual(['documents', 'clients', 'catalogue', 'companies']);
  });
});

describe('hidden tabs (the eye)', () => {
  it('keeps known tabs once, and never the main tab', () => {
    expect(normaliseHidden(['clients', 'documents', 'nope', 'clients', 'catalogue'])).toEqual(['clients', 'catalogue']);
    expect(normaliseHidden(undefined)).toEqual([]);
    expect(normaliseHidden('clients')).toEqual([]);
  });
  it('the bar shows the rest in their order', () => {
    expect(shownTabs(['catalogue', 'companies', 'documents', 'clients'], ['companies', 'clients'])).toEqual(['catalogue', 'documents']);
  });
  it('opens on Your companies, or the first tab shown when that is hidden', () => {
    expect(homeFallback(['documents', 'companies'])).toBe('companies');
    expect(homeFallback(['catalogue', 'documents'])).toBe('catalogue');
    expect(homeFallback([])).toBe('documents');
  });
});
