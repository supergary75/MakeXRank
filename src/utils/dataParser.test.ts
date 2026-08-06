import { describe, expect, it } from 'vitest';
import { parseTableData } from './dataParser';

describe('parseTableData', () => {
  it('aggregates both alliances from an Explorer schedule table', () => {
    const source = [
      '红方战队1名称\t红方战队2名称\t蓝方战队1名称\t蓝方战队2名称\t红方胜负分\t红方总分\t红方净胜分\t蓝方胜负分\t蓝方总分\t蓝方净胜分',
      '原力觉醒\t星辰主宰\t幻影战翼\t超维探索\t3\t420\t80\t0\t340\t-80',
    ].join('\n');

    const teams = parseTableData(source, 'MakeX Explorer');
    expect(teams).toHaveLength(4);
    expect(teams.find((team) => team.team === '原力觉醒')).toMatchObject({ wins: 1, points: 3, totalScore: 420 });
    expect(teams.find((team) => team.team === '幻影战翼')).toMatchObject({ losses: 1, points: 0, totalScore: 340 });
  });
});
