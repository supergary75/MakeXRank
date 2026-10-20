import { useEffect, useRef, useState } from 'react';
import { classes, coachNames, rosterSnapshot } from './classRoster';
import { attendanceError, readAttendance, persistAttendance, statusLabel, type AttendanceRecord, type AttendanceRow } from './attendance';
import { academicCloudEnabled } from '../services/academicCloud';
import { academicAccess } from '../../shared/classDirectory.mjs';
import styles from './ClassMemberManagement.module.css';
import mobile from './WeeklyRollCall.module.css';
import type { AuthUserProfile } from '../types';
import { assignedCoach, classAccess } from './classAccess';
import { readHolidays } from './clubHolidays';
import { nextRegularClass, scheduleSlots, sessionMinutes, shanghaiDate as today, shanghaiMinutes, validDate, weekday, type RollCallMode } from './rollCallSchedule';
export default function WeeklyRollCall({user, onManageClasses, onAttendanceSummary}: {user: AuthUserProfile | null; onManageClasses?: () => void; onAttendanceSummary?: () => void}) {
  const access = classAccess(user);
  const allowed = classes.filter(c => access.all || c.coach === access.coach);
  const ownCoach = assignedCoach(user);
  const [scope,setScope] = useState<'mine' | 'all'>(() => access.all && !ownCoach ? 'all' : 'mine');
  const scopedClasses = scope === 'all' && access.all ? allowed : allowed.filter(c => c.coach === ownCoach);
  const [date,setDate] = useState(today);
  const [mode,setMode] = useState<RollCallMode>('day');
  const [id,setId] = useState('');
  const [session,setSession] = useState('regular');
  const [record,setRecord] = useState<AttendanceRecord>({rows:[],savedAt:'',phase:'draft',audit:[]});
  const [message,setMessage] = useState('');
  const [blocked,setBlocked] = useState(false);
  const [editing,setEditing] = useState('');
  const [guest,setGuest] = useState('');
  const [undo,setUndo] = useState<AttendanceRow | null>(null);
  const [saveError,setSaveError] = useState('');
  const [saving,setSaving]=useState(false);
  const savingRef=useRef(false);
  const writable=academicAccess(user).write;
  const [,setRosterRevision] = useState(0);
  useEffect(()=>{
    const refresh=()=>setRosterRevision(n=>n+1);
    window.addEventListener('storage',refresh);window.addEventListener('class-rosters-updated',refresh);
    return ()=>{window.removeEventListener('storage',refresh);window.removeEventListener('class-rosters-updated',refresh);};
  },[]);
  useEffect(() => { if (!undo) return; const timer = window.setTimeout(()=>setUndo(null),5000); return ()=>window.clearTimeout(timer); }, [undo]);
  const active = allowed.find(c => c.id === id);
  const close = () => { setId(''); setMessage(''); setEditing(''); setUndo(null); setSaveError(''); };
  const rosterState = rosterSnapshot();
  const roster = rosterState.rosters;
  let holidays: ReturnType<typeof readHolidays> = [], holidayError = '';
  try { holidays=readHolidays(); } catch(e) { holidayError=String(e); }
  const open = (d: string, cid: string, s = 'regular') => {
    if(savingRef.current)return;
    if (!validDate(d) || !allowed.some(c => c.id === cid) || rosterState.error) return;
    if(holidayError || holidays.some(h=>h.date===d && h.active)){setMessage(holidayError || '当天俱乐部放假，无需点名。');return;}
    setDate(d); setId(cid); setSession(s); setEditing(''); setMessage(''); setSaveError(''); setBlocked(false); setGuest(''); setUndo(null);
    try { setRecord(readAttendance(d,cid,s) ?? {rows:(roster[cid] ?? []).map(m => ({...m,status:'',reason:'',detail:''})),savedAt:'',phase:'draft',audit:[]}); }
    catch(error) { setRecord({rows:[],savedAt:''}); setBlocked(true); setMessage(String(error)); }
  };
  const persist = async (rows: AttendanceRow[], phase: 'draft' | 'submitted' = 'draft') => {
    if (!user || !active || blocked || rosterState.error || savingRef.current || !writable) return false;
    savingRef.current=true;setSaving(true);
    try { setRecord(await persistAttendance(date,id,session,rows,phase,user.username,record.savedAt)); setSaveError(''); setMessage(phase === 'submitted' ? academicCloudEnabled?'点名已提交到腾讯云。':'点名已提交（本地预览）。' : academicCloudEnabled?'草稿已保存到腾讯云，完成后请提交。':'草稿已自动保存到本地，完成后请提交。'); return true; }
    catch(error) { setSaveError('未保存：'+String(error)+'。本次操作未生效，请重新加载核对。'); return false; }
    finally{savingRef.current=false;setSaving(false);}
  };
  const update = (mid: string, patch: Partial<AttendanceRow>) => { setUndo(null); return persist(record.rows.map(r => r.id === mid ? {...r,...patch} : r)); };
  const arrived = record.rows.filter(r => ['present','late'].includes(r.status)).length;
  const pending = record.rows.filter(r => !r.status).length;
  const submissionIssue = attendanceError(record.rows);
  const cards = scheduleSlots(scopedClasses, date, mode).map(({c,d}) => {
    let saved: AttendanceRecord | null = null; let failed = false;
    try { saved = readAttendance(d,c.id,id === c.id && date === d ? session : mode === 'extra' ? 'extra1' : 'regular'); } catch { failed = true; }
    const rows = saved?.rows ?? roster[c.id] ?? [];
    return {c,d,saved,failed,holiday:holidays.some(h=>h.date===d && h.active),expected:saved?.rows.length ?? roster[c.id]?.length ?? c.count,confirmed:rows.filter(r=>'status' in r && r.status).length,ready:rows.length > 0 && rows.every(r=>r.name.trim())};
  });
  const recommended = mode !== 'extra' ? cards.find(card => card.d === today() && !card.failed && !card.holiday && card.saved?.phase !== 'submitted' && sessionMinutes(card.c.time,true) > shanghaiMinutes()) : undefined;
  const nextClass = !cards.length && !holidayError ? nextRegularClass(scopedClasses,date,holidays.filter(h=>h.active).map(h=>h.date)) : null;
  const candidates = allowed.flatMap(c => roster[c.id] ?? []).filter((m,i,a) => m.name && a.findIndex(n => n.id === m.id) === i && !record.rows.some(r => r.id === m.id));
  const renderRoster = () => active ? <div id={`roll-call-${date}-${id}`} className={mobile.inlineRoster} role="region" aria-label={`${id} 队员点名`}>
      <fieldset className={mobile.controls} disabled={saving||!writable}>
      <p className={mobile.inlineHint}>点姓名直接记录到课；请假在姓名旁操作。</p>
      <div className={mobile.lessonSummary}><strong>已确认 {record.rows.length-pending} / {record.rows.length} 人</strong><span>到课（含迟到）{arrived} · 请假 {record.rows.filter(r=>r.status==='absent').length} · 未到待核实 {record.rows.filter(r=>r.status==='unverified').length}</span><progress className={mobile.progress} aria-label="本次课堂点名进度" value={record.rows.length-pending} max={Math.max(record.rows.length,1)} /></div>
      <details className={mobile.help}><summary>点姓名确认出勤，再点取消 · 自动保存草稿</summary><p>{record.phase==='submitted' ? '更正时保留原正式统计，重新提交后替换。' : record.submittedRows ? '更正草稿已保存，统计暂用上次提交版本。' : '逐人操作自动保存，全部确认后提交。'} 取消出勤后恢复待确认；请假通过右侧入口操作。历史课次保留当时名单。</p></details>
      <div className={mobile.roster}>{record.rows.map(r => <article data-attendance-row={r.status || 'pending'} className={`${mobile.student} ${r.status==='present' || r.status==='late' ? mobile.arrived : ''}`} key={r.id}>
        <div className={mobile.rowTop}>
        <button className={mobile.studentName} aria-label={`${r.name || '姓名待补录'}，${r.status==='present' ? '已到，点击取消出勤' : r.status ? statusLabel(r) : '点击确认出勤'}`} aria-pressed={r.status==='present' || r.status==='late'} disabled={blocked || !r.name || (!!r.status && r.status!=='present')} onClick={async () => {if(await update(r.id,{status:r.status==='present'?'':'present',reason:'',detail:'',lateMinutes:undefined}))setUndo(r);}}><span aria-hidden="true">{r.status==='present' || r.status==='late' ? '✓' : '○'}</span><span>{r.name || '姓名待补录'}</span></button>
        <button className={mobile.editButton} aria-label={`${r.name} 请假`} aria-expanded={editing===r.id} aria-controls={`attendance-edit-${r.id}`} onClick={() => setEditing(editing===r.id ? '' : r.id)}>{editing===r.id ? '收起' : '请假'}</button>
        </div>
        <p className={mobile.status}><span data-attendance-state={r.status || 'pending'} className={mobile.attendanceState}>{r.status ? statusLabel(r) : '待确认'}</span></p>
        {r.temporary && <button onClick={()=>{if(window.confirm('从本次课撤销临时补课队员 '+r.name+'？不改变长期分班。'))persist(record.rows.filter(row=>row.id!==r.id));}}>撤销临时补课</button>}
        {editing===r.id && <div id={`attendance-edit-${r.id}`} className={`${styles.filters} ${mobile.editor}`}>
          <label>状态 <select aria-label={r.name+'状态'} value={r.status==='present' ? 'change' : r.status==='absent' ? r.reason : r.status} onChange={e => {
            const v=e.target.value;
            update(r.id,['病假','事假','自定义'].includes(v) ? {status:'absent',reason:v as AttendanceRow['reason'],detail:'',lateMinutes:undefined} : {status:v as AttendanceRow['status'],reason:'',detail:'',lateMinutes:undefined});
          }}><option value="change" disabled>选择需要更正的状态</option><option value="">待确认（重置后可点姓名）</option><option value="late">迟到</option><option value="病假">病假</option><option value="事假">事假</option><option value="自定义">其他请假</option><option value="unverified">未到·原因待核实</option></select></label>
          {r.status==='late' && <label>迟到时长 <select aria-label={r.name+'迟到时长'} value={r.lateMinutes ?? ''} onChange={e=>update(r.id,{lateMinutes:e.target.value ? Number(e.target.value) : undefined})}><option value="">请选择时长</option>{Array.from({length:18},(_,i)=>(i+1)*10).map(minutes=><option key={minutes} value={minutes}>{minutes} 分钟</option>)}</select></label>}
          {r.status==='absent' && r.reason==='自定义' && <label>简要原因 <input aria-label={r.name+'原因'} maxLength={200} value={r.detail} onChange={e=>setRecord({...record,rows:record.rows.map(row=>row.id===r.id?{...row,detail:e.target.value}:row)})} onBlur={()=>void persist(record.rows)} placeholder="填写后离开输入框保存" /></label>}
        </div>}
      </article>)}</div>
      {(!record.rows.length || record.rows.some(r=>!r.name.trim())) && <div className={mobile.emptySchedule}><p>班级名单尚未准备好，请在班级队员管理中补录姓名后再点名。</p>{onManageClasses && <button onClick={onManageClasses}>前往班级队员管理</button>}</div>}
      <details className={mobile.help}><summary>课次与临时补课设置</summary>
      <div className={styles.filters}><label>课次 <select value={session} onChange={e => open(date,id,e.target.value)}><option value="regular">常规课</option><option value="extra1">加课 1</option><option value="extra2">加课 2</option></select></label><button onClick={() => open(date,id,session)}>重新加载记录</button></div>
      <div className={styles.filters}><label>临时补课 <select value={guest} onChange={e=>setGuest(e.target.value)}><option value="">从有权访问的班级选择</option>{candidates.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><button disabled={!guest || blocked} onClick={async () => {const m=candidates.find(m=>m.id===guest);if(m && await persist([...record.rows,{...m,status:'',reason:'',detail:'',temporary:true}]))setGuest('');}}>加入本次课（不改变分班）</button></div>
      </details>
      {undo && <button onClick={()=>{update(undo.id,undo);}}>撤销刚才对 {undo.name} 的点名</button>}
      <div className={`${styles.saveBar} ${mobile.submitBar}`}>
        <div><strong>{saving?'正在保存…':record.phase==='submitted' ? '本次点名已提交' : `还剩 ${pending} 人待确认`}</strong><span>{saveError ? '保存失败，请重新加载核对' : record.phase==='submitted' ? '修改后需重新提交，才更新正式统计' : record.savedAt ? academicCloudEnabled?'草稿已保存到云端':'草稿已保存到本地' : '逐人确认后提交点名'}</span></div>
        <button data-attendance-submit type="button" disabled={blocked || !!rosterState.error || !!saveError || !!submissionIssue || date>today() || record.phase==='submitted'} onClick={() => {setUndo(null);if(window.confirm('确认提交 '+date+' '+id+' 的点名？\n应到 '+record.rows.length+' 人，到课 '+arrived+' 人，请假 '+record.rows.filter(r=>r.status==='absent').length+' 人，未到待核实 '+record.rows.filter(r=>r.status==='unverified').length+' 人。'))persist(record.rows,'submitted');}}>{record.phase==='submitted' ? '已提交' : '确认提交点名'}</button>
        {date>today() && <p>未来课次可提前登记草稿，到上课当天再提交。</p>}
        {!pending && !!submissionIssue && !!record.rows.length && <p role="status">{submissionIssue}</p>}
        {saveError && <p role="alert" className={styles.saveError}>{saveError}</p>}
      </div>
      </fieldset>
    </div> : null;
  return <div className={`${styles.root} ${mobile.workspace}`}>
    <fieldset className={mobile.controls} disabled={saving}>
    {rosterState.error && <p role="alert" className={styles.saveError}>{rosterState.error} 已暂停名单修改和点名保存。</p>}
    {holidayError && <p role="alert">{holidayError}</p>}
    <h2>{mode === 'week' ? '本周课程' : mode === 'extra' ? '临时加课' : '今日点名'}</h2>
    {!user && <p>请先登录查看本人课程。</p>}
    {user && !allowed.length && <p>当前账号暂无分配班级。</p>}
      <p className={mobile.scheduleSummary}>{scope === 'all' && access.all ? '全部教练' : `${coachNames[ownCoach || ''] || user?.displayName || '本人'}的课程`} · {date || '请选择日期'}{validDate(date) ? ` ${weekday(date)}` : ''} · {cards.length} 个班级</p>
      <div className={`${styles.filters} ${mobile.scheduleActions}`}>
        <button data-roll-call-mode aria-pressed={mode==='day' && date===today()} onClick={() => {close();setDate(today());setMode('day');}}>今日点名</button>
        <button data-roll-call-mode aria-pressed={mode==='week'} onClick={() => {close();setMode('week');}}>本周课程</button>
        <button data-roll-call-mode aria-pressed={mode==='extra'} onClick={() => {close();setMode('extra');}}>临时加课</button>
        {access.all && ownCoach && <button aria-pressed={scope==='all'} onClick={() => {close();setScope(scope==='all' ? 'mine' : 'all');}}>{scope==='all' ? '只看我的课程' : '查看全部教练'}</button>}
        {user?.isActive && onAttendanceSummary && <button type="button" onClick={onAttendanceSummary}>查看出勤汇总表</button>}
      </div>
      <details className={mobile.datePicker} open={mode==='extra' ? true : undefined}><summary>{mode==='extra' ? '选择加课日期' : '查看其他日期'}</summary><label>日期 <input type="date" value={date} onChange={e => {close();setDate(e.target.value);}} /></label></details>
      <div className={styles.grid} data-roll-call-list>{cards.map(({c,d,saved,failed,holiday,expected,confirmed,ready}) => {
        const suggested = recommended?.c.id === c.id && recommended.d === d;
        const expanded = active?.id === c.id && date === d;
        return <article className={`${styles.card} ${mobile.lessonCard} ${expanded ? mobile.expandedCard : ''}`} key={d+c.id} data-roll-call-card>
          <div className={mobile.classSelect}>
          <button type="button" className={styles.cardOpen} disabled={saving||holiday || failed || !!holidayError || !!rosterState.error} aria-expanded={expanded} aria-controls={`roll-call-${d}-${c.id}`} aria-label={(expanded ? '收起' : '展开')+' '+d+' '+c.id+' 队员点名'} onClick={() => expanded ? close() : open(d,c.id,mode==='extra' ? 'extra1' : 'regular')} />
          <div className={styles.top}><span>{d} · {weekday(d)}</span><span data-roll-call-phase={saved?.phase || 'pending'} className={styles.badge}>{holiday ? '俱乐部放假' : failed ? '读取异常' : saved?.phase==='submitted' ? '已提交' : saved ? '点名中' : '未开始'}</span></div>
          <h3>{c.id}</h3><p>{c.time} · {coachNames[c.coach]}</p>
          {mode==='extra' && <p>常规安排：{c.day} · 本次安排加课</p>}
          {holiday ? <p>全俱乐部停课 · 不计应到，无需点名</p> : failed ? <p>记录读取异常，请先核对后再点名。</p> : <>
            <p>{ready ? `已确认 ${confirmed} / ${expected} 人` : `预计 ${expected} 人 · 名单待补录`}</p>
            {ready && <progress className={mobile.progress} aria-label={`${c.id} 点名进度`} value={confirmed} max={Math.max(expected,1)} />}
            <p className={mobile.enterHint}>{expanded ? '收起队员名单 ↑' : !ready ? '展开核对名单 ↓' : saved?.phase==='submitted' ? '展开查看点名记录 ↓' : suggested ? '下一节待点名 · 点击展开名单 ↓' : '点击班级，直接点名 ↓'}</p>
          </>}
          </div>
          {expanded && renderRoster()}
        </article>;
      })}</div>
      {user && !cards.length && <section className={mobile.emptySchedule}>
        <h3>{date === today() ? '今天没有常规课' : validDate(date) ? '这一天没有常规课' : '请选择有效日期'}</h3>
        {nextClass && <p>下次常规课：{nextClass.d} {weekday(nextClass.d)} · {nextClass.c.id} · {nextClass.c.time}</p>}
        <p>可以查看本周安排，或选择临时加课。</p>
      </section>}
    <p role="status">{message}</p>
    <p className={styles.footnote}>{academicCloudEnabled?'点名由腾讯云保存并按班级隔离权限；连接中断时仅可查看缓存，请重连后再记录。':'本地预览：记录只在此浏览器，尚未同步腾讯云。'} 病假不填写诊断详情。</p>
    </fieldset>
  </div>;
}
