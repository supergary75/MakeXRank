import { describe, expect, it } from 'vitest';
import { nationalCoverageCounts, nationalCoverageTopics } from './NationalCoverage';

describe('national curriculum topic counts', () => {
  it('uses visible equal-weight topic denominators for each filter', () => {
    for (const rows of Object.values(nationalCoverageTopics)) {
      expect(rows).toHaveLength(12);
      expect(new Set(rows.map(row => row.name)).size).toBe(12);
      for (const subject of ['数学', '科学／物理']) {
        const selected = rows.filter(row => row.subject === subject);
        expect(selected).toHaveLength(6);
        expect(nationalCoverageCounts(selected).reduce((sum, count) => sum + count, 0)).toBe(6);
        expect(selected.every(row => row.evidence.length > 0)).toBe(true);
      }
    }
  });
  it('does not include future suggestions in existing coverage', () => {
    expect(nationalCoverageCounts(nationalCoverageTopics['小学 · 1–6年级'])).toEqual([8, 2, 2]);
    expect(nationalCoverageCounts(nationalCoverageTopics['初中 · 7–9年级'])).toEqual([7, 3, 2]);
    expect(nationalCoverageCounts(nationalCoverageTopics['高中 · 10–12年级'])).toEqual([7, 3, 2]);
    expect(nationalCoverageCounts([])).toEqual([0, 0, 0]);
  });
});
