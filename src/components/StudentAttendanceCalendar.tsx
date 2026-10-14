import { useState } from 'react';
import { statusLabel, type AttendanceRecord, type AttendanceRow } from './attendance';
import { readHolidays, saveHoliday } from './clubHolidays';
import styles from './StudentAttendanceCalendar.module.css';
type Entry = {date: string; classId: string; session: string; record: AttendanceRecord; row: AttendanceRow};
export function monthCells(month: string) {
  const [year,m]=month.split('-').map(Number);
  const start=(new Date(year,m-1,1).getDay()+6)%7;
  return [...Array<string>(start).fill(''),...Array.from({length:new Date(year,m,0).getDate()},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`)];
}
export default function StudentAttendanceCalendar({entries,canManage,actor}:{entries:Entry[];canManage:boolean;actor:string}) {
  const [month,setMonth]=useState(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date()));
  const [selected,setSelected]=useState('');
  const [note,setNote]=useState('');
  const [message,setMessage]=useState('');
  const [revision,setRevision]=useState(0);void revision;
  let holidays:ReturnType<typeof readHolidays>=[], error='';
  try{holidays=readHolidays();}catch(e){error=String(e);}
  const changeMonth=(delta:number)=>{const [y,m]=month.split('-').map(Number);const d=new Date(y,m-1+delta,1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);setSelected('');setMessage('');};
  const selectedRecords=entries.filter(e=>e.date===selected);
  const holiday=holidays.find(h=>h.date===selected && h.active);
  return <section className={styles.calendar} aria-label="学生出勤月历">
    <div className={styles.toolbar}><h3>出勤月历</h3><button onClick={()=>changeMonth(-1)}>上个月</button><label>月份 <input type="month" value={month} onChange={e=>{if(e.target.value){setMonth(e.target.value);setSelected('');}}} /></label><button onClick={()=>changeMonth(1)}>下个月</button></div>
    <p>绿色：出勤／迟到 · 蓝色：病假 · 橙色：事假 · 紫色：俱乐部放假。状态同时显示文字，空白不代表缺勤。</p>
    <p>月历独立显示所选月份，不受上方统计日期筛选限制；同一天多次课分别标记，草稿不会当作正式出勤。</p>
    {error && <p role="alert">{error}</p>}
    <div className={styles.grid}>{['一','二','三','四','五','六','日'].map(day=><div className={styles.weekday} key={day}>周{day}</div>)}
      {monthCells(month).map((date,index)=>date ? <button key={date} className={`${styles.day} ${selected===date?styles.selected:''}`} aria-label={`${date} 查看出勤`} onClick={()=>{setSelected(date);setNote(holidays.find(h=>h.date===date)?.note || '');setMessage('');}}>
        <strong>{Number(date.slice(-2))}</strong>
        {holidays.some(h=>h.date===date && h.active) && <span className={styles.holiday}>俱乐部放假</span>}
        {entries.filter(e=>e.date===date).map(e=><span key={e.classId+e.session} className={e.record.phase!=='submitted'?styles.pending:e.row.status==='present'||e.row.status==='late'?styles.present:e.row.reason==='病假'?styles.sick:e.row.reason==='事假'?styles.leave:styles.pending}>{e.record.phase!=='submitted'?'草稿·':''}{statusLabel(e.row)}{e.record.hasDraft?'（更正待交）':''}</span>)}
      </button> : <div key={'blank'+index} aria-hidden="true" />)}
    </div>
    {selected && <div className={styles.detail}><h4>{selected}</h4>
      {holiday && <p>俱乐部放假：{holiday.note || '当日停课'}。不产生应到课次，不计入出勤率。</p>}
      {!selectedRecords.length && !holiday && <p>暂无出勤记录，不能据此判断缺勤。</p>}
      {selectedRecords.map(e=><p key={e.classId+e.session}>{e.classId} · {e.session==='regular'?'常规课':e.session==='extra1'?'加课1':'加课2'} · {statusLabel(e.row)} · {e.record.phase==='submitted'?'已提交':'草稿'}{e.row.detail?' · '+e.row.detail:''}</p>)}
      {canManage && <><label>全俱乐部放假说明 <input value={note} maxLength={100} onChange={e=>setNote(e.target.value)} placeholder="例如：俱乐部统一休息" /></label><button disabled={!!error} onClick={()=>{
        if(!window.confirm(`${holiday?'取消':'登记'} ${selected} 全俱乐部放假？此设置对所有班级生效。`))return;
        try{saveHoliday(selected,note,!holiday,actor);setRevision(r=>r+1);setMessage('放假设置已保存到当前浏览器。');}catch(e){setMessage(String(e));}
      }}>{holiday?'取消当日放假':'登记全俱乐部放假'}</button><p>仅 Gary / Lisa 可登记。当天已有点名时拒绝登记，避免抹掉真实出勤。</p></>}
    </div>}
    <p role="status">{message}</p>
  </section>;
}
