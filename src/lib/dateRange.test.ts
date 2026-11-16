import { describe, expect, it } from 'vitest';
import { inRange, presetOf, presetRange, rangeLabel } from './dateRange';

describe('date range', () => {
  it('works out the presets, across a year end and February', () => {
    expect(presetRange('this-month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(presetRange('last-month', '2027-01-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(presetRange('last-year', '2026-11-16')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(presetOf({ from: '2026-01-01', to: '2026-12-31' }, '2026-11-16')).toBe('this-year');
  });

  it('keeps either end open, and reads a backwards range the right way round', () => {
    expect(inRange('2026-11-16', { from: '2026-11-16' })).toBe(true);
    expect(inRange('2026-11-15', { from: '2026-11-16' })).toBe(false);
    expect(inRange('2026-11-16', { to: '2026-11-16' })).toBe(true);
    expect(inRange('2026-10-20', { from: '2026-10-31', to: '2026-10-01' })).toBe(true);
    expect(rangeLabel({}, '2026-11-16')).toBe('Any date');
    expect(rangeLabel({ from: '2026-11-01', to: '2026-11-30' }, '2026-11-16')).toBe('This month');
  });
});
