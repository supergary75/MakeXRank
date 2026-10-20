import { useState, useSyncExternalStore } from 'react';
import type { AuthUserProfile } from '../types';
import { academicCloudEnabled, getAcademicState, refreshAcademic, subscribeAcademic } from '../services/academicCloud';
import { classAccess } from './classAccess';
import { classes, coachNames } from './classRoster';
import { listAttendance } from './attendance';
import { readHolidays } from './clubHolidays';
import { shanghaiDate, shiftDate } from './rollCallSchedule';
import { buildWeeklyReport, weeklyRange, weeklyReportCsv } from './attendanceWeeklyReport';
import css from './AttendanceDashboard.module.css';

export default function WeeklyAttendanceReport({user}: {user: AuthUserProfile}) {
  const access = classAccess(user), allowed = classes.filter(c => access.all || c.coach === access.coach);
  const state = useSyncExternalStore(subscribeAcademic, getAcademicState, getAcademicState);
  const [anchor, setAnchor] = useState(() => shanghaiDate()), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  let error = '', report: ReturnType<typeof buildWeeklyReport> | undefined;
  try {
    const loaded = listAttendance();
    if (loaded.errors) throw new Error('部分记录读取异常，请核对后再导出。');
    report = buildWeeklyReport(allowed, loaded.records, anchor, readHolidays().filter(h => h.active).map(h => h.date));
  } catch (e) { error = e instanceof Error ? e.message : '周报读取失败'; }
  const ready = !academicCloudEnabled || state.phase === 'ready' && state.account === user.authUserId && !state.pending;
  const download = async () => {
    setBusy(true); setMessage('');
    try {
      if (academicCloudEnabled) {
        await refreshAcademic();
        const current = getAcademicState();
        if (current.phase !== 'ready' || current.account !== user.authUserId || current.pending) throw new Error('未能取得最新云端数据，请重试。');
      }
      const loaded = listAttendance();
      if (loaded.errors) throw new Error('部分点名记录读取异常，未导出。');
      const latest = buildWeeklyReport(allowed, loaded.records, anchor, readHolidays().filter(h => h.active).map(h => h.date));
      const url = URL.createObjectURL(new Blob([weeklyReportCsv(latest, coachNames)], {type: 'text/csv;charset=utf-8'}));
      const link = document.createElement('a'); link.href = url; link.download = `Kclub-出勤周报-${latest.from}-${latest.to}.csv`;
      document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage('已发起 CSV 下载，可用 Excel / WPS 打开。请在浏览器下载列表中查看；没有自动发送邮件或微信。');
    } catch (e) { setMessage('未导出：' + (e instanceof Error ? e.message : String(e))); }
    finally { setBusy(false); }
  };
  if (!user.isActive || !allowed.length) return null;
  const start = report?.from || weeklyRange()[0];
  return <section className={css.summary} aria-label="每周出勤周报" data-weekly-attendance-report>
    <div className={css.summaryHeading}><h3>{access.all ? 'Lisa 教务出勤周报' : '我的班级出勤周报'}</h3><span>每周一至周日 · {allowed.length} 个班级</span></div>
    <div className={css.weekControls}>
      <button disabled={busy} onClick={() => setAnchor(shiftDate(start, -7))}>上一周</button>
      <label>周内日期 <input type="date" aria-label="出勤周报日期" value={anchor} disabled={busy} onChange={e => setAnchor(e.target.value)}/></label>
      <button disabled={busy} onClick={() => setAnchor(shanghaiDate())}>本周</button>
      <button disabled={busy} onClick={() => setAnchor(shiftDate(start, 7))}>下一周</button>
      <button disabled={busy || !!error || !ready} onClick={() => void download()}>{busy ? '同步并导出中…' : '导出本周表格（CSV）'}</button>
    </div>
    <p className={css.note}>{report?.from} 至 {report?.to}。{access.all ? 'Lisa 登录后可直接查看全部班级并按周下载。' : '只包含当前账号有权访问的班级。'} 周报不受下方临时筛选影响。出勤率＝实到人次（含迟到）÷正式应到人次；请假计入分母。</p>
    {!ready && <p role="status">请先恢复云端同步，连接就绪后才能导出。</p>}
    {error && <p role="alert">{error}</p>}
    {report && <div className={css.tableScroll} role="region" aria-label="每周班级出勤率" tabIndex={0}><table className={css.table}>
      <thead><tr><th>班级</th><th>教练</th><th>已提交课次</th><th>应到人次</th><th>实到人次</th><th>请假</th><th>未到待核实</th><th>出勤率</th><th>待核对</th></tr></thead>
      <tbody>{report.rows.map(c => <tr key={c.id} data-weekly-class={c.id}><th scope="row">{c.id}</th><td>{coachNames[c.coach] || c.coach}</td><td>{c.summary.lessons}</td><td>{c.summary.lessons ? c.summary.expected : '—'}</td><td>{c.summary.lessons ? c.summary.arrived : '—'}</td><td>{c.summary.lessons ? c.summary.sick + c.summary.leave + c.summary.other : '—'}</td><td>{c.summary.lessons ? c.summary.unverified : '—'}</td><td>{c.summary.expected ? (c.summary.arrived / c.summary.expected * 100).toFixed(1) + '%' : '—'}</td><td>草稿 {c.drafts} · 更正 {c.corrections} · 漏记录 {c.missing}</td></tr>)}</tbody>
      <tfoot><tr><th colSpan={2}>合计</th><td>{report.totals.lessons}</td><td>{report.totals.lessons ? report.totals.expected : '—'}</td><td>{report.totals.lessons ? report.totals.arrived : '—'}</td><td>{report.totals.lessons ? report.totals.sick + report.totals.leave + report.totals.other : '—'}</td><td>{report.totals.lessons ? report.totals.unverified : '—'}</td><td>{report.totals.expected ? (report.totals.arrived / report.totals.expected * 100).toFixed(1) + '%' : '—'}</td><td>按人次加权，不平均各班百分比</td></tr></tfoot>
    </table></div>}
    <p className={css.note}>无正式记录显示“—”，不视为零出勤。草稿、未来课次不计出勤率；更正未提交时沿用上次正式记录。漏记录仅按当前常规课表推算已结束课次，请核对临时停调课。导出含各班汇总与正式课次的到课、请假、未到待核实名单。</p>
    {message && <p role="status">{message}</p>}
  </section>;
}
