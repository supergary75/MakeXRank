import { describe, expect, it } from 'vitest';
import { generateExplorerSchedule } from '../../utils/practiceScheduleGenerator';
import { solveRidgeEpa } from '../../utils/practiceEpa';
import { mergePracticeTeams } from '../../utils/practiceTeamMerge';

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
  it('splits a single alliance score evenly between its two teams', () => {
    const result = solveRidgeEpa(
      ['team-a', 'team-b'],
      [{ teamIds: ['team-a', 'team-b'], total: 30, breakdown: {} }],
      (observation) => observation.total,
    );

    expect(result.get('team-a')).toBeCloseTo(15, 3);
    expect(result.get('team-b')).toBeCloseTo(15, 3);
  });
});
