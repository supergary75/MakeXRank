import { describe, expect, it } from 'vitest';
import {
  aggregatePracticeExplorerTrendMetric,
  getScheduleCardOnlyRows,
  getPracticeExplorerMetricRankings,
  type PracticeExplorerMatchRow,
  type PracticeExplorerTrendMetricKey,
} from './practiceExplorerAnalysis';

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

  it('includes flag and penalty among the per-item rankings', () => {
    expect(rankings.some((item) => item.key === 'flag')).toBe(true);
    expect(rankings.some((item) => item.key === 'penalty')).toBe(true);
  });

  it('clamps legacy negative earned-item values but preserves penalty deductions', () => {
    const legacy = row('legacy-team', 1, 100);
    legacy.flag = -8;
    legacy.yellowBall = -5;
    legacy.penalty = -12;
    const legacyRankings = getPracticeExplorerMetricRankings([legacy]);

    expect(legacyRankings.find((item) => item.key === 'flag')?.teams[0]?.value).toBe(0);
    expect(legacyRankings.find((item) => item.key === 'yellowBall')?.teams[0]?.value).toBe(0);
    expect(legacyRankings.find((item) => item.key === 'penalty')?.teams[0]?.value).toBe(-12);
  });
});

describe('practice Explorer trend metric aggregation', () => {
  it('only accepts rows explicitly produced from saved schedule cards', () => {
    const scheduleRow = row('赛队 A', 1, 100);
    scheduleRow.source = 'schedule-card';
    const importedRow = row('赛队 B', 1, 100);
    importedRow.source = 'imported-table';
    const legacyUnknownRow = row('赛队 C', 1, 100);

    expect(getScheduleCardOnlyRows([scheduleRow, importedRow, legacyUnknownRow])).toEqual([scheduleRow]);
  });
  const complete = row('team', 1, 100);
  Object.assign(complete, {
    contributionScore: 50,
    epa: 40,
    flag: 10,
    onlineBall: 20,
    fieldBall: 30,
    yellowBall: 40,
    bucket: 5,
    yellowBlock: 6,
    redBlueBlock: 7,
    penalty: -10,
    hasDetailedScore: true,
  });
  const incomplete = row('team', 2, 200);
  Object.assign(incomplete, {
    contributionScore: 100,
    epa: 60,
    hasDetailedScore: false,
  });

  it('uses maximum total and ordinary averages for contribution and EPA', () => {
    expect(aggregatePracticeExplorerTrendMetric([complete, incomplete], 'totalScore')).toBe(200);
    expect(aggregatePracticeExplorerTrendMetric([complete, incomplete], 'contributionScore')).toBe(75);
    expect(aggregatePracticeExplorerTrendMetric([complete, incomplete], 'epa')).toBe(50);
  });

  it('excludes incomplete breakdowns from every item and penalty metric', () => {
    const expectations: Partial<Record<PracticeExplorerTrendMetricKey, number>> = {
      flag: 10,
      onlineBall: 20,
      fieldBall: 30,
      yellowBall: 40,
      bucket: 5,
      yellowBlock: 6,
      redBlueBlock: 7,
      penalty: -10,
    };
    Object.entries(expectations).forEach(([key, expected]) => {
      expect(aggregatePracticeExplorerTrendMetric(
        [complete, incomplete],
        key as PracticeExplorerTrendMetricKey,
      )).toBe(expected);
    });
  });

  it('never exposes impossible negative earned scores, but keeps deductions signed', () => {
    const invalid = { ...complete, flag: -8, yellowBall: -5, penalty: -12 };
    expect(aggregatePracticeExplorerTrendMetric([invalid], 'flag')).toBe(0);
    expect(aggregatePracticeExplorerTrendMetric([invalid], 'yellowBall')).toBe(0);
    expect(aggregatePracticeExplorerTrendMetric([invalid], 'penalty')).toBe(-12);
  });
});
