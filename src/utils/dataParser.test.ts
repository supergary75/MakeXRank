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

  it('ignores scheduled Explorer matches whose result cells are still blank', () => {
    const source = [
      '红方战队1名称\t红方战队2名称\t蓝方战队1名称\t蓝方战队2名称\t红方胜负分\t红方总分\t红方净胜分\t蓝方胜负分\t蓝方总分\t蓝方净胜分',
      '已完赛红1\t已完赛红2\t已完赛蓝1\t已完赛蓝2\t3\t420\t80\t0\t340\t-80',
      '未开赛红1\t未开赛红2\t未开赛蓝1\t未开赛蓝2\t\t\t\t\t\t',
    ].join('\n');

    const teams = parseTableData(source, 'MakeX Explorer');
    expect(teams).toHaveLength(4);
    expect(teams.some((team) => team.team.startsWith('未开赛'))).toBe(false);
  });

  it('keeps a recorded scoreless Explorer draw', () => {
    const source = [
      '红方战队1名称\t红方战队2名称\t蓝方战队1名称\t蓝方战队2名称\t红方胜负分\t红方总分\t红方净胜分\t蓝方胜负分\t蓝方总分\t蓝方净胜分',
      '红1\t红2\t蓝1\t蓝2\t1\t0\t0\t1\t0\t0',
    ].join('\n');

    const teams = parseTableData(source, 'MakeX Explorer');
    expect(teams).toHaveLength(4);
    expect(teams.every((team) => team.matches === 1 && team.points === 1)).toBe(true);
  });
});
