import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { attendanceNames, buildWeeklyReport, csvCell, weeklyRange, weeklyReportCsv } from './attendanceWeeklyReport';
import LessonAttendanceSummary from './LessonAttendanceSummary';
import type { AttendanceRow } from './attendance';
import type { Entry } from './attendanceInsights';

const courses = [{id:'Brook-1',coach:'B',day:'周日',time:'10:00–12:00'}, {id:'Other-1',coach:'G',day:'周六',time:'10:00–12:00'}];
const now = new Date('2026-10-18T08:00:00Z');
const present: AttendanceRow = {id:'1',name:'测试到课',status:'present',reason:'',detail:''};
const absent: AttendanceRow = {...present,id:'2',name:'测试请假',status:'absent',reason:'病假',detail:'不应导出诊断详情'};
const unverified: AttendanceRow = {...present,id:'3',name:'测试待核实',status:'unverified'};
const entry = (rows:AttendanceRow[], classId='Brook-1', date='2026-10-18', phase:'draft'|'submitted'='submitted'):Entry => ({date,classId,session:'regular',record:{rows,phase,savedAt:''}});

it('周报始终是周一至周日，支持跨年且拒绝非法日期', () => {
  expect(weeklyRange('2026-10-18')).toEqual(['2026-10-12','2026-10-18']);
  expect(weeklyRange('2027-01-01')).toEqual(['2026-12-28','2027-01-03']);
  expect(()=>weeklyRange('2026-02-30')).toThrow();
});
it('按授权班级和整周统计正式人次，草稿未来和其他班级不计', () => {
  const report=buildWeeklyReport(courses.slice(0,1),[entry([present,absent,unverified]),entry([present],'Other-1'),entry([present],'Brook-1','2026-10-19'),{...entry([present],'Brook-1','2026-10-17','draft'),session:'extra1'}],'2026-10-13',[],now);
  expect(report.totals).toMatchObject({lessons:1,expected:3,arrived:1,sick:1,unverified:1,drafts:1});
  expect(report.records).toHaveLength(2);
  expect(report.rows[0]).toMatchObject({drafts:1,missing:0});
  const csv=weeklyReportCsv(report,{B:'Brook'});
  expect(csv).toContain('33.3%');expect(csv).not.toContain('Other-1');expect(csv).not.toContain(absent.detail);
});
it('更正草稿保留上次正式名单，不能以未提交更正覆盖周报', () => {
  const e=entry([absent],'Brook-1','2026-10-18','draft');e.record.submittedRows=[present];e.record.submittedAt='2026-10-18T04:00:00Z';
  const report=buildWeeklyReport(courses,[e],'2026-10-18',[],now);
  expect(report.totals.arrived).toBe(1);expect(report.rows[0].corrections).toBe(1);
  expect(weeklyReportCsv(report,{B:'Brook'})).not.toContain(absent.name);
});
it('漏记录只标记已结束的常规课，不给未提交班级伪造0%出勤', () => {
  let report=buildWeeklyReport(courses,[],'2026-10-18',[],new Date('2026-10-18T03:00:00Z'));
  expect(report.rows.map(c=>c.missing)).toEqual([0,1]);
  report=buildWeeklyReport(courses,[],'2026-10-18',[],now);
  expect(report.rows.map(c=>c.missing)).toEqual([1,1]);
  expect(report.totals.rate).toBeNull();expect(weeklyReportCsv(report,{B:'Brook'})).not.toContain('0.0%');
  expect(buildWeeklyReport(courses,[],'2026-10-18',['2026-10-18'],now).rows[0].missing).toBe(0);
});
it('整体出勤率使用人次加权，不取各班百分比平均', () => {
  const report=buildWeeklyReport(courses,[entry([present]),entry([absent,unverified,present],'Other-1','2026-10-17')],'2026-10-18',[],now);
  expect(report.totals).toMatchObject({expected:4,arrived:2,rate:50});
  expect(weeklyReportCsv(report,{B:'Brook'})).toContain('50.0%');
});
it('CSV兼容中文Excel，转义逗号引号及公式注入；草稿不泄露未经确认名单', () => {
  expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  for(const name of ['+cmd','-cmd','@cmd',' \t=cmd'])expect(csvCell(name)).toContain("'");
  expect(csvCell('王,小"明')).toBe('"王,小""明"');
  const csv=weeklyReportCsv(buildWeeklyReport(courses,[entry([absent],'Brook-1','2026-10-18','draft')],'2026-10-18',[],now),{B:'Brook'});
  expect(csv.startsWith('\uFEFF')).toBe(true);expect(csv).toContain('\r\n');expect(csv).not.toContain(absent.name);
});
it('点名后直接汇总谁到课、谁请假、谁待核实和谁没点名，不把未点名算缺勤', () => {
  const rows=[present,absent,unverified,{...present,id:'4',name:'测试未点名',status:'' as const}];
  expect(attendanceNames(rows)).toMatchObject({arrived:[present.name],leave:[absent.name],unverified:[unverified.name],pending:['测试未点名']});
  const html=renderToStaticMarkup(<LessonAttendanceSummary record={{rows,savedAt:'',phase:'draft'}}/>);
  for(const r of rows)expect(html).toContain(r.name);
  expect(html).toContain('尚未提交，不更新正式出勤率');expect(html).not.toContain(absent.detail);
});
