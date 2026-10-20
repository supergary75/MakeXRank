import { useState, useSyncExternalStore } from 'react';
import type { AuthUserProfile } from '../types';
import { academicAccess } from '../../shared/classDirectory.mjs';
import { emptyMakeupPlan, makeupStatuses, type MakeupPlan } from '../../shared/makeupPlans.mjs';
import { academicCloudEnabled, getAcademicState, subscribeAcademic, type CloudMakeup } from '../services/academicCloud';
import { classes, coachNames } from './classRoster';
import { listAttendance } from './attendance';
import { attendanceRange } from './attendanceSummary';
import { shanghaiDate, shiftDate } from './rollCallSchedule';
import { buildLeaveEntries, leaveKey, listMakeupPlans, makeupSource, persistMakeupPlan, type LeaveEntry } from './leaveMakeups';
import css from './AttendanceDashboard.module.css';

function MakeupRow({entry,saved,writable,pending,actor}:{entry:LeaveEntry;saved?:CloudMakeup;writable:boolean;pending:boolean;actor:string}) {
  const [plan,setPlan]=useState<MakeupPlan>(()=>saved?.plan ?? emptyMakeupPlan());
  const [expected,setExpected]=useState(saved?.revision ?? 0);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const stale=expected!==(saved?.revision ?? 0), disabled=!writable||pending||busy;
  const changed=JSON.stringify(plan)!==JSON.stringify(saved?.plan ?? emptyMakeupPlan());
  const timed=plan.status==='scheduled'||plan.status==='completed';
  const label=`${entry.name} ${entry.date} ${entry.classId}`;
  const coach=coachNames[classes.find(c=>c.id===entry.classId)?.coach || ''];
  const save=async()=>{
    setBusy(true);setMessage('');
    try{const result=await persistMakeupPlan(entry,plan,expected,actor);setPlan(result.plan);setExpected(result.revision);setMessage(academicCloudEnabled?'已保存到腾讯云':'已保存到本地预览');}
    catch(error){setMessage('未保存：'+(error instanceof Error?error.message:String(error)));}
    finally{setBusy(false);}
  };
  return <tr data-leave-entry={entry.key}>
    <th scope="row"><strong>{entry.name}</strong><span className={css.draftNote}>{entry.classId} · {coach}</span><span className={css.draftNote}>{entry.date} · {entry.session==='regular'?'常规课':entry.session==='extra1'?'加课 1':'加课 2'} · {entry.reason}</span><span className={css.draftNote}>{entry.draft?'请假草稿／提前登记':'已提交请假'}</span></th>
    <td><label>补课状态<select aria-label={`${label} 补课状态`} value={plan.status} disabled={disabled} onChange={e=>{const status=e.target.value as MakeupPlan['status'];setPlan(status==='pending'||status==='waived'?{...emptyMakeupPlan(),status}:{...plan,status});setMessage('');}}>{Object.entries(makeupStatuses).map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label></td>
    <td><div className={css.makeupDates}><label>补课日期<input type="date" aria-label={`${label} 补课日期`} value={plan.date} disabled={disabled||!timed} onChange={e=>{setPlan({...plan,date:e.target.value});setMessage('');}} /></label><div className={css.makeupTimes}><label>开始<input type="time" aria-label={`${label} 补课开始时间`} value={plan.startTime} disabled={disabled||!timed} onChange={e=>{setPlan({...plan,startTime:e.target.value});setMessage('');}} /></label><span>至</span><label>结束<input type="time" aria-label={`${label} 补课结束时间`} value={plan.endTime} disabled={disabled||!timed} onChange={e=>{setPlan({...plan,endTime:e.target.value});setMessage('');}} /></label></div></div></td>
    <td><button type="button" disabled={disabled||stale||!changed} onClick={()=>void save()}>{busy?'保存中…':'保存安排'}</button>{changed&&!message&&!stale&&<span className={css.draftNote}>本行有未保存内容</span>}{stale&&<div role="alert"><p>其他页面已更新，本行未保存内容仍保留。</p><button disabled={disabled} onClick={()=>{setPlan(saved?.plan ?? emptyMakeupPlan());setExpected(saved?.revision ?? 0);setMessage('已载入最新安排');}}>载入最新安排（替换本行内容）</button></div>}{message&&<p role="status" className={css.makeupMessage}>{message}</p>}{saved&&<small className={css.draftNote}>{saved.actor} · {new Date(saved.updatedAt).toLocaleString('zh-CN')}</small>}</td>
  </tr>;
}

export default function LeaveMakeupTable({user,classIds}:{user:AuthUserProfile;classIds:string[]}) {
  const state=useSyncExternalStore(subscribeAcademic,getAcademicState,getAcademicState);
  const [weekStart,setWeekStart]=useState(()=>attendanceRange('week')[0]);
  const weekEnd=shiftDate(weekStart,6);
  let entries:LeaveEntry[]=[], plans:CloudMakeup[]=[], error='';
  try{const loaded=listAttendance(true);if(loaded.errors)throw new Error('部分点名记录读取异常，请重新同步后核对。');entries=buildLeaveEntries(loaded.records,classIds,weekStart,weekEnd);plans=listMakeupPlans();}catch(e){error=e instanceof Error?e.message:String(e);}
  const writable=academicAccess(user).write&&!error&&(!academicCloudEnabled||state.phase==='ready'&&state.account===user.authUserId);
  const byKey=new Map(plans.map(plan=>[leaveKey(makeupSource(plan)),plan]));
  const currentWeek=attendanceRange('week')[0];
  return <section className={css.summary} aria-labelledby="leave-makeup-heading" data-leave-makeup-table>
    <div className={css.summaryHeading}><h3 id="leave-makeup-heading">{weekStart===currentWeek?'本周':'每周'}请假与补课安排</h3><span>{new Set(entries.map(e=>e.memberId)).size} 名队员 · {entries.length} 条请假</span></div>
    <div className={css.weekControls}><button onClick={()=>setWeekStart(shiftDate(weekStart,-7))}>上周</button><strong>{weekStart} 至 {weekEnd}</strong><button onClick={()=>setWeekStart(currentWeek)}>本周</button><button onClick={()=>setWeekStart(shiftDate(weekStart,7))}>下周</button></div>
    <p className={css.note}>自动列出所选教练／班级在整周（周一至周日）的请假，含提前登记和草稿；同一队员每次请假单独记录。补课可安排在以后任何日期，登记后点击“保存安排”。补课不改写原课次出勤；“已补课”由教练实际核实后登记。</p>
    {error&&<p role="alert">{error}</p>}
    {!writable&&!error&&<p>当前仅可查看补课安排；请确认编辑权限及云端连接。</p>}
    {!error&&!entries.length&&<p>本周当前筛选范围暂无已登记请假的队员。{weekStart<=shanghaiDate()&&'未点名不等于已到课。'}</p>}
    {!!entries.length&&<div className={css.tableScroll} role="region" aria-label="每周请假与补课统计表" tabIndex={0}><table className={`${css.table} ${css.makeupTable}`}><caption className={css.caption}>请假队员与补课时间</caption><thead><tr><th scope="col">队员／请假课次</th><th scope="col">补课状态</th><th scope="col">补课日期与时段</th><th scope="col">保存与记录</th></tr></thead><tbody>{entries.map(entry=><MakeupRow key={entry.key} entry={entry} saved={byKey.get(entry.key)} writable={writable} pending={!!state.pending} actor={user.username}/>)}</tbody></table></div>}
    <p className={css.note}>{academicCloudEnabled?'补课安排保存到腾讯云，按原班级权限共享。':'本地预览：补课安排仅保存在此浏览器，尚未同步腾讯云。'}</p>
  </section>;
}
