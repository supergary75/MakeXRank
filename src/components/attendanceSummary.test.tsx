import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AttendanceDashboard from './AttendanceDashboard';
import WeeklyRollCall from './WeeklyRollCall';
import { attendanceRange, buildClassAttendanceRows } from './attendanceSummary';
import { listAttendance, saveAttendance, type AttendanceRow } from './attendance';
import type { Entry } from './attendanceInsights';
import type { AuthUserProfile } from '../types';

const course = { id: 'U18-01', coach: 'G', day: '周日' };
const otherCourse = { id: 'U12A-06', coach: 'V', day: '周四' };
const row: AttendanceRow = { id: 'demo-1', name: '测试队员', status: 'present', reason: '', detail: '' };
const account = (username: string): AuthUserProfile => ({ authUserId: 'demo-' + username, username, displayName: username, role: 'editor', isActive: true, createdAt: '', allowedCompetitionIds: null, allowedEventTypes: null });
const entry = (rows: AttendanceRow[], phase: 'draft' | 'submitted' = 'submitted', date = '2026-10-11'): Entry => ({ date, classId: course.id, session: 'regular', record: { rows, phase, savedAt: '' } });

beforeEach(() => {
  const memory = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), key: (i: number) => [...memory.keys()][i] ?? null, get length() { return memory.size; } });
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T01:00:00Z'));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('默认日期及周月范围均按上海时区计算', () => {
  const now = new Date('2026-09-30T16:30:00Z');
  expect(attendanceRange('today', now)).toEqual(['2026-10-01', '2026-10-01']);
  expect(attendanceRange('week', now)).toEqual(['2026-09-28', '2026-10-01']);
  expect(attendanceRange('month', now)).toEqual(['2026-10-01', '2026-10-01']);
});
it('未建立记录和草稿均不伪造零出勤，保留所有班级', () => {
  const rows = buildClassAttendanceRows([course, otherCourse], [entry([row], 'draft')], '2026-10-11', '2026-10-11');
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ hasSubmitted: false, status: '未提交' });
  expect(rows[1]).toMatchObject({ hasSubmitted: false, status: '当日无常规课' });
  expect(buildClassAttendanceRows([course], [], '2026-10-11', '2026-10-11')[0].status).toBe('未提交（暂无记录）');
});
it('迟到计入实到，请假和待核实单独汇总', () => {
  const rows = [row, { ...row, id: '2', status: 'late' as const, lateMinutes: 20 }, { ...row, id: '3', status: 'absent' as const, reason: '事假' as const }, { ...row, id: '4', status: 'unverified' as const }];
  const report = buildClassAttendanceRows([course], [entry(rows)], '2026-10-11', '2026-10-11')[0];
  expect(report.summary).toMatchObject({ lessons: 1, expected: 4, arrived: 2, late: 1, leave: 1, unverified: 1, rate: 50 });
  expect(report.status).toBe('已提交');
});
it('周月累计的是人次，并排除未来和范围外课次', () => {
  const entries = [entry([row]), entry([row], 'submitted', '2026-10-04'), entry([row], 'submitted', '2026-10-18')];
  const report = buildClassAttendanceRows([course], entries, '2026-10-01', '2026-10-31', '2026-10-11')[0];
  expect(report.summary).toMatchObject({ lessons: 2, expected: 2, arrived: 2 });
});
it('更正草稿沿用正式快照，重新提交才更新汇总', () => {
  const submitted = saveAttendance('2026-10-11', course.id, 'regular', [row], 'submitted', 'supergary', '');
  const draft = saveAttendance('2026-10-11', course.id, 'regular', [{ ...row, status: 'absent', reason: '事假' }], 'draft', 'supergary', submitted.savedAt);
  let report = buildClassAttendanceRows([course], listAttendance().records, '2026-10-11', '2026-10-11')[0];
  expect(report.summary.arrived).toBe(1); expect(report.status).toBe('待重新提交');
  saveAttendance('2026-10-11', course.id, 'regular', draft.rows, 'submitted', 'supergary', draft.savedAt);
  report = buildClassAttendanceRows([course], listAttendance().records, '2026-10-11', '2026-10-11')[0];
  expect(report.summary.arrived).toBe(0); expect(report.summary.leave).toBe(1); expect(report.status).toBe('已提交');
});
it('未来、放假及非法范围不会显示实际出勤数字', () => {
  expect(buildClassAttendanceRows([course], [], '2026-10-18', '2026-10-18', '2026-10-11')[0].status).toBe('尚未上课');
  expect(buildClassAttendanceRows([course], [], '2026-10-11', '2026-10-11', '2026-10-11', ['2026-10-11'])[0].status).toBe('俱乐部放假');
  expect(buildClassAttendanceRows([course], [entry([row])], '', '2026-10-11')[0]).toMatchObject({ hasSubmitted: false, status: '日期范围无效' });
});
it('Gary 默认今日汇总表包含15个班级且没有学员姓名', () => {
  saveAttendance('2026-10-11', course.id, 'regular', [row], 'submitted', 'supergary', '');
  const html = renderToStaticMarkup(<AttendanceDashboard user={account('supergary')} onRollCall={() => {}} />);
  expect((html.match(/data-summary-class=/g) || []).length).toBe(15);
  expect(html).toContain('全班级出勤汇总表'); expect(html).toContain('返回今日点名');
  expect(html).toContain('value="2026-10-11"'); expect(html).not.toContain('U12B-10');
  const summary = html.slice(html.indexOf('data-attendance-summary'), html.indexOf('</table>'));
  expect(summary).not.toContain(row.name); expect(summary).toContain('—');
});
it('教练只能看到本人班级，未登录不显示汇总', () => {
  const html = renderToStaticMarkup(<AttendanceDashboard user={account('BrookY')} />);
  expect((html.match(/data-summary-class=/g) || []).length).toBe(6);
  expect(html).toContain('我的班级出勤汇总表'); expect(html).not.toContain('data-summary-class="U18-01"');
  expect(renderToStaticMarkup(<AttendanceDashboard user={null} />)).not.toContain('data-summary-class');
});
it('只有已登录用户显示点名页面的汇总入口', () => {
  expect(renderToStaticMarkup(<WeeklyRollCall user={account('supergary')} onAttendanceSummary={() => {}} />)).toContain('查看出勤汇总表');
  expect(renderToStaticMarkup(<WeeklyRollCall user={null} onAttendanceSummary={() => {}} />)).not.toContain('查看出勤汇总表');
});
