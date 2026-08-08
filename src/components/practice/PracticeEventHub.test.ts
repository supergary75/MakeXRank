import { describe, expect, it } from 'vitest';
import { generateExplorerSchedule } from '../../utils/practiceScheduleGenerator';
import { solveRidgeEpa } from '../../utils/practiceEpa';

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
