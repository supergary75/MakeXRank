import { describe, expect, it } from 'vitest';
import { generateExplorerSchedule } from '../../utils/practiceScheduleGenerator';
import { solveRidgeEpa } from '../../utils/practiceEpa';
import { mergePracticeTeams } from '../../utils/practiceTeamMerge';
import { auditExplorerScheduleScores, buildScheduleAnalysisRows, type ExplorerScheduleCard } from './PracticeEventHub';

const completeBreakdown = (overrides: Record<string, number> = {}) => ({
  flag: 0, cone: 0, yellowBlock: 0, colorBlock: 0, yellowNet: 0,
  yellowFrame: 0, ball5: 0, ball10: 0, ball20: 0, ballNet: 0,
  ballFrame: 0, violation: 0, yellow: 0, redCard: 0, ...overrides,
});

function scheduleCard(): ExplorerScheduleCard {
  const team = (id: string, teamName: string) => ({ id, teamName, eventItem: 'MakeX Explorer', teamNo: id, members: [] });
  return {
    id: 'card-1', createdAt: '2026-08-15T00:00:00.000Z', fieldCount: 1,
    schedule: [{
      id: 'match-1', slot: 1, field: 1,
      red1: team('official-a', '原力觉醒'), red2: team('b', '烈焰梦魇'),
      blue1: team('c', '星辰主宰'), blue2: team('d', '永远的国王'),
    }, {
      id: 'match-2', slot: 2, field: 1,
      red1: team('manual-a', ' 原力觉醒 '), red2: team('c', '星辰主宰'),
      blue1: team('b', '烈焰梦魇'), blue2: team('d', '永远的国王'),
    }],
    results: {
      'match-1': {
        redScore: 100, blueScore: 80,
        redBreakdown: completeBreakdown({ flag: 30, cone: 20, ballNet: 50 }),
        blueBreakdown: completeBreakdown({ flag: 30, cone: 20, ballNet: 30 }),
      },
      'match-2': {
        redScore: 120, blueScore: 90,
        redBreakdown: completeBreakdown({ flag: 30, cone: 20, ballNet: 70 }),
        blueBreakdown: completeBreakdown({ flag: 30, cone: 20, ballNet: 40 }),
      },
    },
  };
}

describe('mergePracticeTeams', () => {
  it('keeps the logistics identity when a manual team repeats the same team name with another number', () => {
    const teams = mergePracticeTeams(
      [{ id: 'official', eventItem: 'MakeX Explorer', teamNo: '152346', teamName: '原力觉醒', isKClub: true, members: [{ id: 'a', name: 'A' }] }],
      [{ id: 'manual', eventItem: 'MakeX Explorer', teamNo: '0005', teamName: ' 原力觉醒 ', members: [{ id: 'b', name: 'B' }] }],
    );

    expect(teams).toHaveLength(1);
    expect(teams[0].teamNo).toBe('152346');
    expect(teams[0].isKClub).toBe(true);
    expect(teams[0].members.map((member) => member.name)).toEqual(['A', 'B']);
  });

  it('does not merge identical names from different event items', () => {
    const teams = mergePracticeTeams(
      [{ id: 'explorer', eventItem: 'MakeX Explorer', teamNo: '1', teamName: '同名队伍', members: [] }],
      [{ id: 'inspire', eventItem: 'MakeX Inspire', teamNo: '2', teamName: '同名队伍', members: [] }],
    );

    expect(teams).toHaveLength(2);
  });

  it('does not merge different names merely because their team numbers match', () => {
    const teams = mergePracticeTeams(
      [{ id: 'first', eventItem: 'MakeX Explorer', teamNo: '152346', teamName: '原力觉醒', members: [] }],
      [{ id: 'second', eventItem: 'MakeX Explorer', teamNo: '152346', teamName: '另一支赛队', members: [] }],
    );

    expect(teams).toHaveLength(2);
  });
});

describe('generateExplorerSchedule', () => {
  it('gives every team four matches without duplicating teams in a simultaneous slot', () => {
    const teams = Array.from({ length: 8 }, (_, index) => ({
      id: `team-${index + 1}`,
      eventItem: 'MakeX Explorer',
      teamNo: String(98000 + index),
      teamName: `Team ${index + 1}`,
      members: [{ id: `member-${index + 1}`, name: `Member ${index + 1}` }],
    }));

    const schedule = generateExplorerSchedule(teams, 4, 2);
    expect(schedule).not.toBeNull();
    expect(schedule).toHaveLength(8);

    const appearances = new Map<string, number>();
    const slotTeams = new Map<number, Set<string>>();
    schedule?.forEach((match) => {
      const ids = [match.red1.id, match.red2.id, match.blue1.id, match.blue2.id];
      expect(new Set(ids)).toHaveLength(4);
      const inSlot = slotTeams.get(match.slot) ?? new Set<string>();
      ids.forEach((id) => {
        expect(inSlot.has(id)).toBe(false);
        inSlot.add(id);
        appearances.set(id, (appearances.get(id) ?? 0) + 1);
      });
      slotTeams.set(match.slot, inSlot);
    });

    teams.forEach((team) => expect(appearances.get(team.id)).toBe(4));
  });
});

describe('Explorer schedule EPA', () => {
  it('merges appearances by displayed team name even when saved ids differ', () => {
    const rows = buildScheduleAnalysisRows([scheduleCard()]);
    expect(rows.filter((row) => row.team.trim() === '原力觉醒')).toHaveLength(2);
  });

  it('audits every saved alliance total against its complete scoring breakdown', () => {
    const audits = auditExplorerScheduleScores([scheduleCard()]);
    expect(audits).toHaveLength(4);
    expect(audits.every((audit) => audit.hasCompleteBreakdown && audit.difference === 0)).toBe(true);

    const card = scheduleCard();
    card.results['match-1'].redScore = 101;
    expect(auditExplorerScheduleScores([card]).find((audit) => audit.matchId === 'match-1' && audit.alliance === 'red')?.difference).toBe(1);
  });

  it('uses the recomputed breakdown total in analysis when the saved total is inconsistent', () => {
    const card = scheduleCard();
    card.results['match-1'].redScore = 999;
    const affectedRows = buildScheduleAnalysisRows([card]).filter((row) => (
      row.team === '原力觉醒' && row.round === 1
    ));

    expect(affectedRows).toHaveLength(1);
    expect(affectedRows[0].totalScore).toBe(100);
    expect(affectedRows[0].contributionScore).toBe(50);
  });

  it('marks legacy partial score details unavailable instead of silently filling missing items with zero', () => {
    const card = scheduleCard();
    card.results['match-1'].redBreakdown = { flag: 30 };
    const audit = auditExplorerScheduleScores([card]).find((item) => item.matchId === 'match-1' && item.alliance === 'red');
    expect(audit).toMatchObject({ hasCompleteBreakdown: false, calculatedTotal: null, difference: null });
    expect(buildScheduleAnalysisRows([card]).filter((row) => row.team === '原力觉醒')[0].hasDetailedScore).toBe(false);
  });

  it('splits a single alliance score evenly between its two teams', () => {
    const result = solveRidgeEpa(
      ['team-a', 'team-b'],
      [{ teamIds: ['team-a', 'team-b'], total: 30, breakdown: {} }],
      (observation) => observation.total,
    );

    expect(result.get('team-a')).toBeCloseTo(15, 3);
    expect(result.get('team-b')).toBeCloseTo(15, 3);
  });

  it('decomposes a scored item from changing alliance partners instead of splitting every match in half', () => {
    const result = solveRidgeEpa(
      ['team-a', 'team-b', 'team-c'],
      [
        { teamIds: ['team-a', 'team-b'], total: 0, breakdown: { yellowBlock: 30 } },
        { teamIds: ['team-a', 'team-c'], total: 0, breakdown: { yellowBlock: 50 } },
        { teamIds: ['team-b', 'team-c'], total: 0, breakdown: { yellowBlock: 40 } },
      ],
      (observation) => observation.breakdown.yellowBlock,
    );

    // A modest ridge penalty deliberately shrinks the sparse three-match
    // solution toward the component baseline instead of over-fitting it.
    expect(result.get('team-a')).toBeCloseTo(20, 3);
    expect(result.get('team-b')).toBeCloseTo(15, 3);
    expect(result.get('team-c')).toBeCloseTo(25, 3);
    expect((result.get('team-c') ?? 0) > (result.get('team-a') ?? 0)).toBe(true);
    expect((result.get('team-a') ?? 0) > (result.get('team-b') ?? 0)).toBe(true);
  });

  it('keeps an underdetermined partial schedule near the observed contribution instead of exploding', () => {
    const result = solveRidgeEpa(
      ['team-a', 'team-b', 'team-c', 'team-d'],
      [
        { teamIds: ['team-a', 'team-b'], total: 480, breakdown: {} },
        { teamIds: ['team-a', 'team-c'], total: 500, breakdown: {} },
      ],
      (observation) => observation.total,
    );

    expect(result.get('team-a')).toBeGreaterThan(240);
    expect(result.get('team-a')).toBeLessThan(300);
    expect(result.get('team-b')).toBeGreaterThan(200);
    expect(result.get('team-c')).toBeGreaterThan(200);
    expect(result.get('team-d')).toBeCloseTo(245, 3);
  });

  it('does not pull disconnected low- and high-scoring alliance groups toward one global mean', () => {
    const result = solveRidgeEpa(
      ['team-a', 'team-b', 'team-c', 'team-d'],
      [
        { teamIds: ['team-a', 'team-b'], total: 100, breakdown: {} },
        { teamIds: ['team-c', 'team-d'], total: 500, breakdown: {} },
      ],
      (observation) => observation.total,
    );

    expect(result.get('team-a')).toBeCloseTo(50, 3);
    expect(result.get('team-b')).toBeCloseTo(50, 3);
    expect(result.get('team-c')).toBeCloseTo(250, 3);
    expect(result.get('team-d')).toBeCloseTo(250, 3);
  });

  it('keeps the sum of independently regressed score components equal to the regressed total', () => {
    const observations = [
      { teamIds: ['team-a', 'team-b'] as [string, string], total: 100, breakdown: { first: 60, second: 40 } },
      { teamIds: ['team-a', 'team-c'] as [string, string], total: 140, breakdown: { first: 80, second: 60 } },
      { teamIds: ['team-b', 'team-c'] as [string, string], total: 120, breakdown: { first: 50, second: 70 } },
    ];
    const ids = ['team-a', 'team-b', 'team-c'];
    const total = solveRidgeEpa(ids, observations, (observation) => observation.total);
    const first = solveRidgeEpa(ids, observations, (observation) => observation.breakdown.first);
    const second = solveRidgeEpa(ids, observations, (observation) => observation.breakdown.second);

    ids.forEach((id) => {
      expect((first.get(id) ?? 0) + (second.get(id) ?? 0)).toBeCloseTo(total.get(id) ?? 0, 5);
    });
  });
});
