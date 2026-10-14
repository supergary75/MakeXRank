import { summarize, type Entry } from './attendanceInsights';
import { shanghaiDate, shiftDate, validDate, weekday } from './rollCallSchedule';

export type AttendancePeriod = 'today' | 'week' | 'month';
export function attendanceRange(period: AttendancePeriod, now = new Date()): [string, string] {
  const end = shanghaiDate(now);
  if (period === 'today') return [end, end];
  if (period === 'month') return [end.slice(0, 7) + '-01', end];
  const day = new Date(end + 'T12:00:00Z').getUTCDay();
  return [shiftDate(end, -(day + 6) % 7), end];
}

type SummaryClass = { id: string; coach: string; day: string };
export function buildClassAttendanceRows(
  schedules: SummaryClass[], entries: Entry[], from: string, to: string,
  asOf = shanghaiDate(), holidays: string[] = [],
) {
  const valid = validDate(from) && validDate(to) && from <= to;
  const records = valid ? entries.filter(e => validDate(e.date) && e.date >= from && e.date <= to && e.date <= asOf) : [];
  return schedules.map(c => {
    const lessons = records.filter(e => e.classId === c.id);
    const summary = summarize(lessons);
    let status = '未提交（暂无记录）', state = 'missing';
    if (!valid) { status = '日期范围无效'; state = 'off'; }
    else if (from > asOf) { status = '尚未上课'; state = 'off'; }
    else if (summary.drafts) {
      status = summary.lessons ? (lessons.every(e => e.record.phase === 'submitted') ? '待重新提交' : '部分待提交') : '未提交';
      state = 'draft';
    } else if (summary.lessons) { status = '已提交'; state = 'submitted'; }
    else if (from === to && holidays.includes(from)) { status = '俱乐部放假'; state = 'off'; }
    else if (from === to && c.day !== weekday(from)) { status = '当日无常规课'; state = 'off'; }
    return { ...c, summary, hasSubmitted: summary.lessons > 0, status, state };
  });
}
