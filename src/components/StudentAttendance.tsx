import { useEffect, useState } from 'react';
import { listAttendance, statusLabel } from './attendance';
import type { Member } from './classRoster';
import styles from './ClassMemberManagement.module.css';
import StudentAttendanceCalendar from './StudentAttendanceCalendar';

export default function StudentAttendance({ member, allowedIds, onBack, canManage = false, actor = '' }: { member: Member; allowedIds: string[]; onBack: () => void; canManage?: boolean; actor?: string }) {
  const dateString = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const [from, setFrom] = useState(() => dateString(new Date(Date.now() - 56 * 86400000)));
  const [to, setTo] = useState(() => dateString(new Date()));
  const [, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('storage', refresh);
    window.addEventListener('attendance-updated', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('attendance-updated', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  let data: ReturnType<typeof listAttendance> = { records: [], errors: 0 };
  try { data = listAttendance(true); } catch { data.errors++; }
  const allEntries = data.records.filter(entry => allowedIds.includes(entry.classId)).flatMap(entry => {
    const row = entry.record.rows.find(row => row.id === member.id);
    return row ? [{ ...entry, row }] : [];
  }).sort((a, b) => b.date.localeCompare(a.date));
  const entries = allEntries.filter(entry=>entry.date>=from && entry.date<=to);
  const final = entries.flatMap(entry => {
    const row = entry.record.phase === 'submitted' ? entry.row : entry.record.submittedRows?.find(row => row.id === member.id);
    return row?.status ? [{...entry, row}] : [];
  });
  const present = final.filter(e => ['present', 'late'].includes(e.row.status)).length;
  const latest = [...allEntries].sort((a,b)=>b.record.savedAt.localeCompare(a.record.savedAt))[0];
  const pendingEntries = allEntries.filter(e=>e.record.phase==='draft');
  const today = dateString(new Date());
  return <div className={styles.root}>
    <button onClick={onBack}>← 返回班级队员</button>
    <h2>{member.name || '姓名待补录'} · 出勤档案</h2>
    <details><summary>档案关联信息</summary><p>队员 ID：{member.id}。以 ID 关联记录，不按姓名猜测合并。</p></details>
    <button onClick={() => setRevision(value => value + 1)}>刷新出勤记录</button>
    <section aria-label="最新签到" className={styles.card}>
      <h3>最新签到记录</h3>
      {latest ? <>
        <p><strong>{statusLabel(latest.row)}</strong> · {latest.date} · {latest.classId} · {latest.session==='regular'?'常规课':latest.session==='extra1'?'加课 1':'加课 2'}</p>
        <p>{latest.record.phase==='submitted'?'已提交 · 已计入对应日期的正式统计':latest.date>today?'未来课程草稿 · 已保存，不计正式出勤':'已保存 · 待教练核对提交'}</p>
        {latest.row.detail && <p>备注：{latest.row.detail}</p>}
        <button onClick={()=>{setFrom(latest.date);setTo(latest.date);}}>查看这次课的明细</button>
      </> : <p>尚未建立该队员的点名记录。</p>}
      <p>此处显示最近保存的记录，不受下方日期筛选限制。</p>
    </section>
    {!!pendingEntries.length && <details open><summary>有 {pendingEntries.length} 条待提交点名记录</summary>
      {pendingEntries.map(e=><p key={e.date+e.classId+e.session}>{e.date} · {e.classId} · {e.session==='regular'?'常规课':e.session==='extra1'?'加课 1':'加课 2'} · {statusLabel(e.row)}{e.date>today?' · 未来课程草稿':''}</p>)}
      <p>记录已保存，不用重复签到。当天点名全部核对后，在点名页面提交；未来课程不能提前提交实际出勤。</p>
    </details>}
    <h3>正式出勤统计</h3>
    <div className={styles.filters}><label>起始日期 <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>结束日期 <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label><button onClick={() => { setFrom(dateString(new Date(Date.now()-56*86400000)));setTo(dateString(new Date())); }}>最近 8 周</button><button onClick={() => { const n = new Date(); n.setDate(1);setFrom(dateString(n));setTo(dateString(new Date())); }}>本月</button></div>
    {from > to && <p role="alert">起始日期不能晚于结束日期。</p>}
    {data.errors > 0 && <p role="alert">有 {data.errors} 条记录无法读取，以下统计可能不完整。</p>}
    <div className={styles.grid}>
      <article className={styles.card}><h3>{final.length}</h3><p>已提交应参加课次</p></article>
      <article className={styles.card}><h3>{present}</h3><p>已提交到课（含迟到 {final.filter(e=>e.row.status==='late').length} 次）</p></article>
      <article className={styles.card}><h3>{final.length ? Math.round(present/final.length*100)+'%' : '暂无'}</h3><p>出勤率</p></article>
    </div>
    {!final.length && <p>此范围内还没有正式提交的记录，不代表孩子未出勤；已保存的签到请看上方“最新签到记录”。</p>}
    <p>病假 {final.filter(e=>e.row.reason==='病假').length} · 事假 {final.filter(e=>e.row.reason==='事假').length} · 其他请假 {final.filter(e=>e.row.reason==='自定义').length} · 未到待核实 {final.filter(e=>e.row.status==='unverified').length} · 草稿／待确认 {entries.filter(e=>e.record.phase==='draft' || !e.row.status).length}</p>
    <p>口径：到课（含迟到）÷ 已提交且已确认的应参加课次；请假及未到待核实计入分母，草稿不计入。未建立点名记录的课次暂无法统计，结果不代表完整学期。</p>
    <StudentAttendanceCalendar entries={allEntries} canManage={canManage} actor={actor} />
    {!entries.length && <p>该时间范围内暂无可访问的出勤记录。完成点名后会自动出现在这里。</p>}
    {entries.map(entry=><article className={styles.card} key={entry.date+entry.classId+entry.session}>
      <h3>{entry.date} · {entry.classId}</h3><p>{entry.session==='regular' ? '常规课' : entry.session==='extra1' ? '加课 1' : '加课 2'} · {statusLabel(entry.row)} · {entry.record.phase==='submitted' ? '已提交' : '草稿'}</p>
      {entry.row.detail && <p>备注：{entry.row.detail}</p>}
      {entry.record.phase === 'draft' && entry.record.submittedRows && <p>当前展示最新更正草稿；上方正式统计仍保留上次提交结果。</p>}
      <p>保存时间：{new Date(entry.record.savedAt).toLocaleString('zh-CN')}</p>
    </article>)}
    <p className={styles.footnote}>仅显示当前账号可访问班级的本地记录；历史名单不会因当前班级删除队员而删除。跨班转移需要保留同一队员 ID，新建同名条目不会自动合并。</p>
  </div>;
}
