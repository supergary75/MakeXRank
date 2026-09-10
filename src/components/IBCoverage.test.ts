import { describe, expect, it } from 'vitest';
import { coverageCounts, coverageTopics } from './IBCoverage';

describe('IB topic coverage denominators', () => {
  it('counts every selected topic exactly once, including subject filters', () => {
    for (const rows of Object.values(coverageTopics)) {
      expect(rows).toHaveLength(12);
      expect(new Set(rows.map(row => row.topic)).size).toBe(rows.length);
      for (const subject of ['全部', '数学', '科学／物理']) {
        const selected = rows.filter(row => subject === '全部' || row.subject === subject);
        expect(selected.length).toBeGreaterThan(0);
        expect(coverageCounts(selected).reduce((sum, count) => sum + count, 0)).toBe(selected.length);
        expect(selected.every(row => row.basis.length > 0)).toBe(true);
      }
    }
  });
  it('does not count proposed extensions as existing cases', () => {
    expect(coverageCounts(coverageTopics.PYP)).toEqual([8, 2, 2]);
    expect(coverageCounts(coverageTopics.MYP)).toEqual([7, 3, 2]);
    expect(coverageCounts(coverageTopics.DP)).toEqual([7, 2, 3]);
    expect(coverageCounts([])).toEqual([0, 0, 0]);
  });
});
