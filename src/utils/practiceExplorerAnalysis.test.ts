import { describe, expect, it } from 'vitest';
import { getPracticeExplorerMetricRankings, type PracticeExplorerMatchRow } from './practiceExplorerAnalysis';

function row(team: string, round: number, totalScore: number): PracticeExplorerMatchRow {
  return {
    team,
    round,
    totalScore,
    contributionScore: totalScore / 2,
    epa: totalScore / 3,
    equity: 0,
    bucket: 0,
    flag: 0,
    yellowBlock: 0,
    redBlueBlock: 0,
    yellowBall: 0,
    onlineBall: 0,
    fieldBall: 0,
    penalty: 0,
    redCard: 0,
  };
}

describe('practice Explorer metric ranking aggregation', () => {
  const rankings = getPracticeExplorerMetricRankings([
    row('永远的国王', 1, 665),
    row('永远的国王', 2, 400),
    row('永远的国王', 3, 440),
    row('永远的国王', 4, 400),
    row('稳定队', 1, 500),
    row('稳定队', 2, 500),
    row('稳定队', 3, 500),
    row('稳定队', 4, 500),
  ]);

  it('uses the highest alliance score for 单场最高总分', () => {
    const ranking = rankings.find((item) => item.key === 'totalScore');
    expect(ranking?.aggregation).toBe('best');
    expect(ranking?.teams[0]).toMatchObject({ team: '永远的国王', value: 665 });
  });

  it('uses the event average rather than the highest match for 平均贡献分', () => {
    const ranking = rankings.find((item) => item.key === 'contributionScore');
    expect(ranking?.aggregation).toBe('average');
    expect(ranking?.teams[0]).toMatchObject({ team: '稳定队', value: 250 });
    expect(ranking?.teams[1]?.value).toBeCloseTo(238.125);
  });
});
