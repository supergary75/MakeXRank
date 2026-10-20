import type { AttendanceRecord } from './attendance';
import { attendanceNames } from './attendanceWeeklyReport';
import css from './WeeklyRollCall.module.css';

export default function LessonAttendanceSummary({record}: {record: AttendanceRecord}) {
  const names = attendanceNames(record.rows);
  return <section className={css.resultSummary} aria-label="本次点名名单汇总">
    <h4>{record.phase === 'submitted' ? '已提交名单汇总' : '当前点名汇总（草稿）'}</h4>
    <dl>{([
      ['到课（含迟到）', names.arrived], ['请假', names.leave],
      ['未到待核实', names.unverified], ['未点名', names.pending],
    ] as const).map(([label, list]) => <div key={label}><dt>{label} · {list.length} 人</dt><dd>{list.length ? list.join('、') : '无'}</dd></div>)}</dl>
    {record.phase !== 'submitted' && <p>尚未提交，不更新正式出勤率。未点名不等于缺勤；未到待核实不自动判为旷课。</p>}
  </section>;
}
