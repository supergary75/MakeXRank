import { describe, expect, it } from 'vitest';
import { attendanceError, attendanceKey, type AttendanceRow } from './attendance';
const row: AttendanceRow = { id: 'test', name: '测试队员', status: '', reason: '', detail: '' };
describe('点名校验', () => {
  it('迟到需选择10分钟一档的时长', () => {
    expect(attendanceError([{ ...row, status: 'late' }])).not.toBe('');
    expect(attendanceError([{ ...row, status: 'late', lateMinutes: 15 }])).not.toBe('');
    expect(attendanceError([{ ...row, status: 'late', lateMinutes: 20 }])).toBe('');
  });
  it('拒绝空名单和未点名', () => {
    expect(attendanceError([])).not.toBe('');
    expect(attendanceError([row])).not.toBe('');
  });
  it('拒绝空白姓名', () => expect(attendanceError([{ ...row, name: ' ', status: 'present' }])).not.toBe(''));
  it('出勤无需原因', () => expect(attendanceError([{ ...row, status: 'present' }])).toBe(''));
  it('缺勤必须有原因', () => expect(attendanceError([{ ...row, status: 'absent' }])).not.toBe(''));
  it('接受病假和事假', () => {
    for (const reason of ['病假', '事假'] as const) expect(attendanceError([{ ...row, status: 'absent', reason }])).toBe('');
  });
  it('自定义原因不得为空白', () => {
    expect(attendanceError([{ ...row, status: 'absent', reason: '自定义', detail: ' ' }])).not.toBe('');
    expect(attendanceError([{ ...row, status: 'absent', reason: '自定义', detail: '交通延误' }])).toBe('');
  });
  it('不同日期与班级使用独立记录', () => {
    expect(attendanceKey('2026-09-19', 'U15A-03')).not.toBe(attendanceKey('2026-09-20', 'U15A-03'));
    expect(attendanceKey('2026-09-19', 'U15A-03')).not.toBe(attendanceKey('2026-09-19', 'U12A-06'));
  });
});
