import { describe, expect, it } from 'vitest';
import { buildFocusTeamSchedules, countScheduleRows } from './focusScheduleParser';

describe('focusScheduleParser', () => {
  it('reads Markdown schedules and ignores bilingual header rows', () => {
    const source = [
      '| 场地 | 场次 | 红方战队1 | 红方战队1名称 | 红方战队2 | 红方战队2名称 | 蓝方战队1 | 蓝方战队1名称 | 蓝方战队2 | 蓝方战队2名称 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| Arena | Session | Red 1 Team No. | Red 1 Team Name | Red 2 Team No. | Red 2 Team Name | Blue 1 Team No. | Blue 1 Team Name | Blue 2 Team No. | Blue 2 Team Name |',
      '| E3 | 1 | 1 | 烈焰牛油果 | 2 | 麒麟 | 3 | 原力觉醒 | 4 | 脉冲星 |',
    ].join('\n');

    expect(countScheduleRows(source)).toBe(1);
    const [schedule] = buildFocusTeamSchedules(source, '原力觉醒');
    expect(schedule.matches).toHaveLength(1);
    expect(schedule.matches[0]).toMatchObject({ field: 'E3', matchNo: '1', teamName: '原力觉醒' });
  });
});
