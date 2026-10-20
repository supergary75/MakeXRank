import type { AttendanceRecord, AttendanceRow } from './attendance';
import { summarize, type Entry } from './attendanceInsights';
import { sessionMinutes, shanghaiDate, shanghaiMinutes, shiftDate, validDate, weekday } from './rollCallSchedule';

export function attendanceNames(rows: AttendanceRow[]) {
  return {
    arrived: rows.filter(r => r.status === 'present' || r.status === 'late').map(r => r.name),
    leave: rows.filter(r => r.status === 'absent').map(r => r.name),
    unverified: rows.filter(r => r.status === 'unverified').map(r => r.name),
    pending: rows.filter(r => !r.status).map(r => r.name),
  };
}

export function formalAttendance(record: AttendanceRecord): AttendanceRecord {
  if (record.phase === 'draft' && record.submittedRows) return {
    ...record, rows: record.submittedRows, phase: 'submitted', hasDraft: true,
    savedAt: record.submittedAt || record.savedAt,
  };
  return record;
}

export function weeklyRange(anchor = shanghaiDate()): [string, string] {
  if (!validDate(anchor)) throw new Error('请选择有效的周报日期。');
  const start = shiftDate(anchor, -(new Date(anchor + 'T12:00:00Z').getUTCDay() + 6) % 7);
  return [start, shiftDate(start, 6)];
}

type Schedule = { id: string; coach: string; day: string; time: string };
export function buildWeeklyReport(schedules: Schedule[], entries: Entry[], anchor: string, holidays: string[] = [], now = new Date()) {
  const [from, to] = weeklyRange(anchor), today = shanghaiDate(now);
  const ids = new Set(schedules.map(c => c.id));
  const records = entries.filter(e => ids.has(e.classId) && validDate(e.date) && e.date >= from && e.date <= to && e.date <= today)
    .map(e => ({ ...e, record: formalAttendance(e.record) }));
  const rows = schedules.map(c => {
    const lessons = records.filter(e => e.classId === c.id), summary = summarize(lessons);
    const due = Array.from({ length: 7 }, (_, i) => shiftDate(from, i))
      .filter(d => weekday(d) === c.day && !holidays.includes(d) && (d < today || d === today && sessionMinutes(c.time, true) <= shanghaiMinutes(now)));
    const missing = due.filter(d => !lessons.some(e => e.date === d && e.session === 'regular')).length;
    const drafts = lessons.filter(e => e.record.phase !== 'submitted').length;
    const corrections = lessons.filter(e => e.record.hasDraft).length;
    return { ...c, summary, missing, drafts, corrections };
  });
  return { from, to, asOf: now.toISOString(), rows, records, totals: summarize(records) };
}
export type WeeklyReport = ReturnType<typeof buildWeeklyReport>;

// Quote every field and neutralize spreadsheet formulas, including control/whitespace prefixes.
export function csvCell(value: string | number) {
  const text = String(value), safe = /^[\s\uFEFF]*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function weeklyReportCsv(report: WeeklyReport, coachNames: Record<string, string>) {
  const metric = (n: number, lessons: number) => lessons ? n : '';
  const counts = (s: WeeklyReport['totals']) => [s.lessons, metric(s.expected, s.lessons), metric(s.arrived, s.lessons), metric(s.sick + s.leave + s.other, s.lessons), metric(s.unverified, s.lessons), s.expected ? (s.arrived / s.expected * 100).toFixed(1) + '%' : ''];
  const table: (string | number)[][] = [
    ['Kclub 每周班级出勤周报'], ['统计周期', report.from, report.to],
    ['生成时间（北京时间）', new Date(report.asOf).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })],
    ['口径', '仅已提交且不晚于今天的考勤；实到含迟到；请假及未到待核实计入应到人次。无正式记录留空，不等于0出勤。'],
    ['待核对', '漏记录课次按当前常规课表与放假日历推算，仅统计已结束课程；请核对临时停调课。'], [],
    ['班级', '教练', '已提交课次', '应到人次', '实到人次（含迟到）', '请假人次', '未到待核实人次', '出勤率', '待提交草稿', '待重新提交', '已结束常规课无记录（需核对）'],
    ...report.rows.map(c => [c.id, coachNames[c.coach] || c.coach, ...counts(c.summary), c.drafts, c.corrections, c.missing]),
    ['合计', '', ...counts(report.totals), report.rows.reduce((n, c) => n + c.drafts, 0), report.rows.reduce((n, c) => n + c.corrections, 0), report.rows.reduce((n, c) => n + c.missing, 0)], [],
    ['课次明细（仅正式点名列出姓名）'],
    ['日期', '班级', '教练', '课次', '状态', '应到人数', '实到人数', '请假人数', '未到待核实人数', '到课名单', '请假名单', '未到待核实名单'],
    ...report.records.slice().sort((a, b) => (a.date + a.classId + a.session).localeCompare(b.date + b.classId + b.session)).map(e => {
      const c = report.rows.find(c => c.id === e.classId)!, submitted = e.record.phase === 'submitted';
      const s = summarize([e]), names = attendanceNames(submitted ? e.record.rows : []);
      return [e.date, e.classId, coachNames[c.coach] || c.coach, e.session === 'regular' ? '常规课' : e.session === 'extra1' ? '加课1' : '加课2', !submitted ? '草稿未提交，不计出勤' : e.record.hasDraft ? '正式记录（有更正待提交）' : '已提交', metric(s.expected, s.lessons), metric(s.arrived, s.lessons), metric(s.sick + s.leave + s.other, s.lessons), metric(s.unverified, s.lessons), names.arrived.join('、'), names.leave.join('、'), names.unverified.join('、')];
    }),
  ];
  return '\uFEFF' + table.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
