import { useEffect, useState } from 'react';
import type { AuthUserProfile } from '../types';
import { classes, coachNames } from './classRoster';
import { classAccess } from './classAccess';
import { listAttendance, statusLabel } from './attendance';
import { buildAlerts, defaultRules, summarize, type Rules, type AttendanceAlert } from './attendanceInsights';
import styles from './ClassMemberManagement.module.css';
import dashboard from './AttendanceDashboard.module.css';
import { attendanceRange, buildClassAttendanceRows } from './attendanceSummary';
import { shanghaiDate as dayString, validDate } from './rollCallSchedule';
import { readHolidays } from './clubHolidays';
import { academicCloudEnabled, refreshAcademic } from '../services/academicCloud';
import LeaveMakeupTable from './LeaveMakeupTable';
import WeeklyAttendanceReport from './WeeklyAttendanceReport';
type Followup = { status: string; actor: string; at: string };
const followKey='makexrank-attendance-followups-v1';
const rulesKey='makexrank-attendance-rules-v1';
export default function AttendanceDashboard({user, onRollCall}: {user: AuthUserProfile | null; onRollCall?: () => void}) {
  const access=classAccess(user), allowed=classes.filter(c=>access.all || c.coach===access.coach);
  const [from,setFrom]=useState(()=>attendanceRange('today')[0]), [to,setTo]=useState(()=>attendanceRange('today')[1]);
  const [cid,setCid]=useState(''),[coach,setCoach]=useState('');
  const [rules,setRules]=useState<Rules>(defaultRules);
  const [appliedRules,setAppliedRules]=useState<Rules>(defaultRules);
  const [follow,setFollow]=useState<Record<string,Followup>>({});
  const [message,setMessage]=useState('');
  const [tick,setTick]=useState(()=>Date.now());
  const [,setRevision]=useState(0);
  const [ruleReady,setRuleReady]=useState(false);
  useEffect(()=>{
    try {
      const r=JSON.parse(localStorage.getItem(rulesKey)||'null');
      if(r && Object.keys(defaultRules).every(k=>Number.isInteger(r[k]) && r[k]>0 && r[k]<=100) && r.late<=4){setRules(r);setAppliedRules(r);}
      const f=JSON.parse(localStorage.getItem(followKey)||'{}');
      if(f && typeof f==='object' && !Array.isArray(f))setFollow(f);
      setRuleReady(true);
    } catch {setMessage('设置或跟进记录读取失败，请检查本地数据。');}
    const refresh=()=>{setTick(Date.now());setRevision(n=>n+1);};window.addEventListener('storage',refresh);window.addEventListener('attendance-updated',refresh);const timer=window.setInterval(()=>{void refreshAcademic();refresh();},60000);
    return ()=>{window.removeEventListener('storage',refresh);window.removeEventListener('attendance-updated',refresh);window.clearInterval(timer);};
  },[]);
  let loaded: ReturnType<typeof listAttendance>={records:[],errors:0};
  try {loaded=listAttendance();}catch{loaded.errors++;}
  const visible=allowed.filter(c=>(!cid || c.id===cid) && (!coach || c.coach===coach));
  const ids=visible.map(c=>c.id), end=to<dayString()?to:dayString();
  const rangeValid=validDate(from) && validDate(to) && from<=to;
  const entries=rangeValid ? loaded.records.filter(e=>ids.includes(e.classId) && validDate(e.date) && e.date>=from && e.date<=end) : [];
  const totals=summarize(entries);
  let holidays:string[]=[], calendarError='';
  try {holidays=readHolidays().filter(h=>h.active).map(h=>h.date);}catch{calendarError='放假日历读取异常，未记录课程的状态需人工核对。';}
  const classRows=buildClassAttendanceRows(visible,entries,from,to,dayString(),holidays);
  const displayCount=(count:number, submitted=totals.lessons>0)=>submitted ? count : '—';
  // Alert lookback is all accessible submitted history up to the selected end date.
  const history=rangeValid ? loaded.records.filter(e=>ids.includes(e.classId) && validDate(e.date) && e.date<=end) : [];
  const alerts: AttendanceAlert[]=buildAlerts(history,appliedRules).filter(a=>a.date>=from && a.date<=end);
  // Only remind about existing drafts: no fabricated past lessons before scheduling is implemented.
  for(const e of entries.filter(e=>e.record.phase!=='submitted' || e.record.hasDraft)){
    const c=classes.find(c=>c.id===e.classId);const finish=c?.time.split('–')[1];
    if(e.session==='regular' && finish && new Date(e.date+'T'+finish+':00+08:00').getTime()<tick)alerts.push({id:`draft:${e.date}:${e.classId}:${e.session}`,title:`${e.classId} · 点名未提交`,date:e.date,classId:e.classId,detail:'课程常规结束时间已过，请教练补交点名，不计为孩子缺勤。'});
  }
  const pending=alerts.filter(a=>follow[a.id]?.status!=='已处理').length;
  if(!user || !allowed.length)return <div className={styles.root}><h2>出勤统计与预警</h2><p>{user?'当前账号没有可访问班级。':'请先登录查看统计。'}</p></div>;
  return <div className={styles.root}>
    <h2>出勤统计与预警 <span className={styles.warning}>{pending} 项待跟进</span></h2>
    <WeeklyAttendanceReport key={user.authUserId} user={user}/>
    <div className={styles.filters}>{(['today','week','month'] as const).map((period,i)=>{const r=attendanceRange(period);return <button key={period} data-roll-call-mode aria-pressed={from===r[0] && to===r[1]} onClick={()=>{setFrom(r[0]);setTo(r[1]);}}>{['今日','本周','本月'][i]}</button>;})}<label>从 <input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label><label>至 <input type="date" value={to} onChange={e=>setTo(e.target.value)} /></label>
      {access.all && <label>教练 <select value={coach} onChange={e=>setCoach(e.target.value)}><option value="">全部</option>{Object.entries(coachNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>}
      <label>班级 <select value={cid} onChange={e=>setCid(e.target.value)}><option value="">全部</option>{allowed.map(c=><option key={c.id}>{c.id}</option>)}</select></label><button onClick={()=>{void refreshAcademic();setTick(Date.now());setRevision(n=>n+1);}}>刷新统计</button>{onRollCall && <button onClick={onRollCall}>返回今日点名</button>}
    </div>
    {!rangeValid && <p role="alert">日期范围不正确，请重新选择。</p>}
    {!!loaded.errors && <p role="alert">有 {loaded.errors} 条记录读取异常，统计可能不完整。</p>}
    {calendarError && <p role="alert">{calendarError}</p>}
    <section className={dashboard.summary} aria-labelledby="class-attendance-summary-heading" data-attendance-summary>
      <div className={dashboard.summaryHeading}><h3 id="class-attendance-summary-heading">{access.all ? '全班级' : '我的班级'}出勤汇总表</h3><span>显示 {classRows.length} 个班级</span></div>
      <p className={dashboard.note}>{from} 至 {to} · {academicCloudEnabled?'统计来自当前账号可访问的云端点名；同步状态见上方。':'本地预览，尚未跨设备同步。'} 无已提交记录显示“—”，不代表出勤为零。同一队员参加多节课按人次累计；当天单个课次即为人数。</p>
      <div className={dashboard.tableScroll} role="region" aria-label="班级出勤汇总表，可横向滚动" tabIndex={0}>
        <table className={dashboard.table}>
          <caption className={dashboard.caption}>班级出勤汇总表</caption>
          <thead><tr><th scope="col">班级</th><th scope="col">教练</th><th scope="col">已提交课次</th><th scope="col">应到（人次）</th><th scope="col">实到（含迟到）</th><th scope="col">迟到</th><th scope="col">请假</th><th scope="col">未到待核实</th><th scope="col">出勤率</th><th scope="col">提交状态</th></tr></thead>
          <tbody>{classRows.map(c=><tr key={c.id} data-summary-class={c.id}>
            <th scope="row">{c.id}</th><td>{coachNames[c.coach] || c.coach}</td><td>{c.summary.lessons}</td>
            <td>{displayCount(c.summary.expected,c.hasSubmitted)}</td><td>{displayCount(c.summary.arrived,c.hasSubmitted)}</td><td>{displayCount(c.summary.late,c.hasSubmitted)}</td>
            <td>{displayCount(c.summary.sick+c.summary.leave+c.summary.other,c.hasSubmitted)}</td><td>{displayCount(c.summary.unverified,c.hasSubmitted)}</td><td>{c.summary.rate===null?'—':c.summary.rate+'%'}</td>
            <td><span className={dashboard.status} data-attendance-summary-status={c.state}>{c.status}</span>{c.summary.drafts>0 && <span className={dashboard.draftNote}>{c.summary.drafts} 份待提交记录</span>}</td>
          </tr>)}</tbody>
          <tfoot><tr><th scope="row" colSpan={2}>合计（当前筛选范围）</th><td>{totals.lessons}</td><td>{displayCount(totals.expected)}</td><td>{displayCount(totals.arrived)}</td><td>{displayCount(totals.late)}</td><td>{displayCount(totals.sick+totals.leave+totals.other)}</td><td>{displayCount(totals.unverified)}</td><td>{totals.rate===null?'—':totals.rate+'%'}</td><td>{totals.drafts} 份草稿待提交</td></tr></tfoot>
        </table>
      </div>
      {!classRows.length && <p>当前筛选范围没有可访问班级。</p>}
      <p className={dashboard.note}>更正草稿不替换上次正式统计，重新提交后才更新人数。常规课和加课分别统计；未建立记录的课次不推算应到人数。</p>
    </section>
    <LeaveMakeupTable user={user} classIds={ids}/>
    <div className={styles.grid}>{[['已提交课次',totals.lessons],['应到人次',displayCount(totals.expected)],['实际到课（含迟到）',displayCount(totals.arrived)],['出勤率',totals.rate===null?'暂无':totals.rate+'%'],['迟到人次',displayCount(totals.late)],['待提交草稿',totals.drafts]].map(([label,n])=><article key={label} className={styles.card}><h3>{n}</h3><p>{label}</p></article>)}</div>
    <p>病假 {displayCount(totals.sick)} · 事假 {displayCount(totals.leave)} · 其他请假 {displayCount(totals.other)} · 未到待核实 {displayCount(totals.unverified)}</p>
    <p>统计截至所选结束日期（不晚于今天）。出勤率＝到课人次（含迟到）÷已提交且已确认的应到人次，请假计入分母。草稿、未来课程和未建立记录不计入。</p>
    {access.all && <details><summary>预警规则设置（Gary / Lisa）</summary><div className={styles.filters}>{Object.entries({consecutive:'连续缺席次数',late:'最近4次迟到次数',rate:'月出勤率低于（%）',minimum:'月统计最少课次'}).map(([key,label])=><label key={key}>{label}<input type="number" min={1} max={key==='rate'?100:key==='late'?4:100} value={rules[key as keyof Rules]} onChange={e=>setRules({...rules,[key]:Number(e.target.value)})} /></label>)}</div><button disabled={!ruleReady} onClick={()=>{
      if(!Object.values(rules).every(n=>Number.isInteger(n)&&n>0&&n<=100)||rules.late>4){setMessage('请输入有效正整数，迟到阈值不得超过4。');return;}
      try{localStorage.setItem(rulesKey,JSON.stringify(rules));setAppliedRules(rules);setMessage('规则已保存到本地。');}catch{setMessage('规则保存失败。');}
    }}>保存规则</button></details>}
    <h3>预警与跟进</h3><p>连续缺席包含请假，请以关怀方式跟进。规则查看历史连续性，列表显示所选日期范围触发的提醒；同一条提醒保留跟进状态。</p>
    {!alerts.length && <p>当前范围没有触发预警（不代表未记录的课程均正常）。</p>}
    {alerts.map(a=><article className={styles.card} key={a.id}><h3>{a.title}</h3><p>{a.date} · {a.classId} · 负责教练 {coachNames[classes.find(c=>c.id===a.classId)?.coach || '']}</p><p>{a.detail}</p><label>处理状态 <select value={follow[a.id]?.status || '待跟进'} disabled={!ruleReady} onChange={e=>{
      try{const current=JSON.parse(localStorage.getItem(followKey)||'{}');const next={...current,[a.id]:{status:e.target.value,actor:user.username,at:new Date().toISOString()}};localStorage.setItem(followKey,JSON.stringify(next));setFollow(next);setMessage('跟进状态已保存。');}catch{setMessage('跟进状态保存失败，未更新。');}
    }}><option>待跟进</option><option>已联系</option><option>已处理</option></select></label>{follow[a.id] && <p>{follow[a.id].actor} · {new Date(follow[a.id].at).toLocaleString('zh-CN')}</p>}</article>)}
    <h3>班级明细（点击展开）</h3>{visible.map(c=>{const records=entries.filter(e=>e.classId===c.id), summary=summarize(records);return <details key={c.id}><summary>{c.id} · {coachNames[c.coach]} · {summary.lessons ? `到课 ${summary.arrived}/${summary.expected} 人次` : '暂无已提交记录'}</summary>{!records.length && <p>暂无记录</p>}{records.map(e=><article key={e.date+e.session} className={styles.card}><h3>{e.date} · {e.session==='regular'?'常规课':'加课'} · {e.record.phase==='submitted'?'已提交':'草稿'}</h3><ul>{e.record.rows.map(r=><li key={r.id}>{r.name}：{statusLabel(r)}</li>)}</ul></article>)}</details>;})}
    <p role="status">{message}</p><p className={styles.footnote}>打开页面时每分钟同步；关闭页面不报警，不发送微信。预警规则和跟进状态目前仍仅保存在本机，补课安排由腾讯云独立保存（本地预览除外）。未建立点名记录的课程暂不能判断漏交，加课因无结束时间暂不判断超时。</p>
  </div>;
}
