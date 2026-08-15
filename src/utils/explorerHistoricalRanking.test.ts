import { describe, expect, it } from 'vitest';
import {
  getExplorerHistoricalContributionRank,
  isExplorerEventType,
} from './explorerHistoricalRanking';

describe('Explorer historical average-contribution ranking', () => {
  it('accepts Explorer naming variants but excludes Inspire', () => {
    expect(isExplorerEventType('MakeX Explorer')).toBe(true);
    expect(isExplorerEventType('MakeX Explorer 小学组')).toBe(true);
    expect(isExplorerEventType('MakeX Explorer 初中组')).toBe(true);
    expect(isExplorerEventType('Explorer 数智先锋')).toBe(true);
    expect(isExplorerEventType('MakeX Inspire')).toBe(false);
  });

  it('uses competition ranking so equal values share the same place', () => {
    expect(getExplorerHistoricalContributionRank(199, [230, 199, 199, 180])).toBe(2);
    expect(getExplorerHistoricalContributionRank(199.04, [199.01, 190])).toBe(1);
    expect(getExplorerHistoricalContributionRank(199, [])).toBeNull();
  });
});
