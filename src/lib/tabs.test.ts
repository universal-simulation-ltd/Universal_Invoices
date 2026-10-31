import { describe, expect, it } from 'vitest';
import { moveTab, normaliseOrder, TAB_VALUES } from './tabs';

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
