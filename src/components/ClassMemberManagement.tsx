import { useEffect, useRef, useState } from 'react';
import styles from './ClassMemberManagement.module.css';
import StudentAttendance from './StudentAttendance';
import pilot from './PilotMemberCard.module.css';
import cabin from './ClassCabinCard.module.css';
import { planRosterImport, planRosterRecovery } from './rosterImport';
import { listAttendance } from './attendance';
import { classAccess } from './classAccess';
import type { AuthUserProfile } from '../types';

import { classes, coachNames, rosterSnapshot, persistRosters, type Member, type Rosters } from './classRoster';
import { academicCloudEnabled } from '../services/academicCloud';
import { academicAccess } from '../../shared/classDirectory.mjs';

export default function ClassMemberManagement({ user }: { user: AuthUserProfile | null }) {
  const access = classAccess(user);
  const allowed = classes.filter(item => access.all || item.coach === access.coach);
  const [profile, setProfile] = useState<Member | null>(null);
  const [day, setDay] = useState('全部');
  const [coach, setCoach] = useState('全部');
  const [initial] = useState(rosterSnapshot);
  const [rosters, setRosters] = useState<Rosters>(initial.rosters);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [importText, setImportText] = useState('');
  const [importMode,setImportMode] = useState('recover');
  const [preview, setPreview] = useState<ReturnType<typeof planRosterImport> | null>(null);
  const [previewExpected,setPreviewExpected]=useState<Rosters|null>(null);
  const [editExpected,setEditExpected]=useState<Rosters|null>(null);
  const [saving,setSaving]=useState(false);
  const savingRef=useRef(false);
  const writable=academicAccess(user).write;
  useEffect(()=>{
    const refresh=()=>{const next=rosterSnapshot();if(!next.error)setRosters(next.rosters);};
    window.addEventListener('class-rosters-updated',refresh);window.addEventListener('storage',refresh);
    return ()=>{window.removeEventListener('class-rosters-updated',refresh);window.removeEventListener('storage',refresh);};
  },[]);
  const membersOf = (item: typeof classes[number]) => rosters[item.id] ?? (academicCloudEnabled?[]:Array.from({ length: item.count }, (_, i) => ({ id: `${item.id}-${i}`, name: '' })));
  const save = async (id: string, members: Member[]) => {
    if(savingRef.current||!writable)return false;
    savingRef.current=true;setSaving(true);
    try {
      setRosters(await persistRosters({ [id]: members }, editing?editExpected??rosters:rosters)); setEditExpected(null);setMessage(academicCloudEnabled?'名单已保存到腾讯云。':'已保存到当前浏览器（本地预览）。'); return true;
    } catch (error) { setMessage(`保存失败，本次修改未保存：${String(error)}`); return false; }
    finally{savingRef.current=false;setSaving(false);}
  };
  const active = allowed.find(item => item.id === selected);
  const visible = allowed.filter(item => (day === '全部' || item.day === day) && (coach === '全部' || item.coach === coach)).map(item => ({ ...item, count: membersOf(item).length, seats: Math.max(0, item.count + item.seats - membersOf(item).length) }));
  const coachGroups = Array.from(new Set([...Object.keys(coachNames), ...visible.map(item => item.coach)]))
    .map(key => ({ key, name: coachNames[key] || key, items: visible.filter(item => item.coach === key) }))
    .filter(group => group.items.length > 0);
  if (initial.error) return <div className={styles.root}><p role="alert">{initial.error}</p><button onClick={()=>window.location.reload()}>重新加载</button></div>;
  if (profile && active) return <StudentAttendance member={profile} allowedIds={allowed.map(item=>item.id)} onBack={()=>setProfile(null)} canManage={access.all&&writable} actor={user?.username || ''} />;
  if (active) {
    const members = membersOf(active);
    return <div className={styles.root} data-class-directory>
      <button type="button" onClick={() => { setSelected(null); setEditing(null); setName(''); setMessage(''); }}>← 返回班级列表</button>
      <h2>{active.id} · 队员管理</h2>
      <p>{active.day} {active.time} · 教练 {coachNames[active.coach]} · {members.length} 人 · 空位 {Math.max(0, active.count + active.seats - members.length)}</p>
      {members.some(m=>!m.name) && <p role="alert">当前尚未读取完整真实名单。空白条目只是按班级人数显示的占位，不代表姓名已经保存；请先恢复已提供的名册，不必逐人重录。</p>}
      <form className={styles.filters} onSubmit={async event => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) { setMessage('请输入队员姓名。'); return; }
        if (members.some(member => member.id !== editing && member.name.toLowerCase() === trimmed.toLowerCase())) { setMessage('本班已存在同名队员，请核对后添加区分信息。'); return; }
        const next = editing ? members.map(member => member.id === editing ? { ...member, name: trimmed } : member) : [...members, { id: crypto.randomUUID(), name: trimmed }];
        if (await save(active.id, next)) { setName(''); setEditing(null); }
      }}>
        <label>队员姓名 <input aria-label="队员姓名" value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="中文名 / 英文名" required /></label>
        <button type="submit" disabled={saving||!writable}>{saving?'保存中…':editing ? '保存修改' : '新增队员'}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setName(''); }}>取消编辑</button>}
      </form>
      {members.length > active.count + active.seats && <p>当前人数超过原表容量，请核对班级安排。</p>}
      <p role="status">{message}</p>
      <div className={pilot.grid}>{members.map((member, i) => <article key={member.id} className={pilot.card} data-class-card>
        <div className={pilot.header}><span className={pilot.serial}>KCLUB / 队员通行证</span><span className={pilot.classCode}>{active.id}</span></div>
        <button className={pilot.identity} type="button" aria-label={`${member.name || '姓名待补录'} 出勤档案`} onClick={()=>setProfile(member)}>
          <span className={pilot.emblem} aria-hidden="true">{member.name.trim().slice(0,1) || '？'}</span>
          <span className={pilot.names}><strong>{member.name.match(/^[^a-zA-Z]+/)?.[0].trim() || member.name || '姓名待补录'}</strong><span>{member.name.match(/[a-zA-Z].*$/)?.[0] || '俱乐部队员'}</span></span>
          <span className={pilot.arrow} aria-hidden="true">↗</span>
        </button>
        <div className={pilot.footer}><span>点击姓名 · 查看出勤档案</span>
        <details className={pilot.actions}><summary aria-label={`${member.name || '待补录队员'} 管理操作`}>•••</summary><div>
          <button type="button" disabled={saving||!writable} onClick={event => { setEditing(member.id); setEditExpected(rosters);setName(member.name); setMessage(''); event.currentTarget.closest('details')?.removeAttribute('open'); document.querySelector<HTMLInputElement>('input[aria-label="队员姓名"]')?.focus(); }}>编辑姓名</button>
          <button type="button" disabled={saving||!writable} onClick={async () => {
            if (window.confirm(`确认从 ${active.id} 移除${member.name || `待补录队员 ${i + 1}`}？`)) {
              if (await save(active.id, members.filter(entry => entry.id !== member.id)) && editing === member.id) { setEditing(null); setName(''); }
            }
          }}>移出班级</button>
        </div></details></div>
        <div className={pilot.stub} aria-label={`本班队员序号 ${i+1}`}><span>MEMBER</span><strong>{String(i+1).padStart(2,'0')}</strong><span className={pilot.stubRule} aria-hidden="true" /><small>队员序号</small></div>
      </article>)}</div>
      {!members.length && <p>本班暂无队员，请在上方新增。</p>}
      <p className={styles.footnote}>{academicCloudEnabled?'名单与历史点名由腾讯云保存，按账号班级权限访问。移出班级不会删除历史出勤。':'本地预览：仅保存在当前浏览器，尚未上传云端。'} 请勿在公用设备录入个人信息。</p>
    </div>;
  }
  return <div className={styles.root} data-class-directory>
    <div className={styles.intro}><div><p>CLASS DIRECTORY / 班级档案</p><h2>每一个班级，一目了然</h2></div><strong>{classes.length} 个班级</strong></div>
    <p>班级按负责教练分组。点击班级查看和管理队员，人数与空位随真实名册更新。</p>
    {!user && <p>请先登录查看班级与队员信息。</p>}
    {access.all && <details><summary>本地批量导入名单</summary>
      <p>支持已保存的 JSON 名册、Markdown 表格、Excel 制表符数据或“班级|姓名”。默认恢复缺失名单，不移除现有队员或按旧表转班；优先沿用已有及历史人员 ID，不修改排课或出勤记录。</p>
      <div className={styles.filters}><label>名单处理方式 <select aria-label="名单处理方式" value={importMode} onChange={e=>{setImportMode(e.target.value);setPreview(null);}}><option value="recover">恢复 / 合并（保留现有队员和分班）</option><option value="replace">完整替换（核对后更新分班）</option></select></label>
        <label>选择名册文件 <input type="file" aria-label="选择名册文件" accept=".json,.txt,.tsv" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{setImportText(await file.text());setPreview(null);setMessage('文件已读取，请识别预览后恢复。');}catch{setMessage('文件读取失败，未修改名单。');}}} /></label>
        <button type="button" onClick={()=>{
          const scoped=Object.fromEntries(allowed.filter(c=>rosters[c.id]).map(c=>[c.id,rosters[c.id]]));
          if(!Object.keys(scoped).length){setMessage('当前尚无真实名册可备份，请先恢复。');return;}
          const url=URL.createObjectURL(new Blob([JSON.stringify({format:'makexrank-roster-backup-v1',exportedAt:new Date().toISOString(),rosters:scoped},null,2)],{type:'application/json'}));
          const link=document.createElement('a');link.href=url;link.download=`班级真实名册-${new Date().toISOString().slice(0,10)}.json`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
        }}>下载真实名册备份</button></div>
      <form onSubmit={event => {
        event.preventDefault();
        try {
          const history=listAttendance(true);
          if(history.errors)throw new Error('有历史考勤无法读取，请先核对，暂不自动恢复人员 ID。');
          const identities=history.records.filter(e=>allowed.some(c=>c.id===e.classId)).flatMap(e=>e.record.rows);
          setPreview(importMode==='recover' ? planRosterRecovery(importText,rosters,identities) : planRosterImport(importText, rosters));setPreviewExpected(rosters);setMessage('识别完成，请核对下面预览。');
        }
        catch(error) { setPreview(null); setMessage('识别失败：'+String(error)); }
      }}>
        <label>班级名单<textarea aria-label="班级名单" rows={8} value={importText} onChange={event => {setImportText(event.target.value);setPreview(null);}} required /></label>
        <button type="submit">识别表格并预览</button>
      </form>
      {preview && <section aria-label="导入预览">
        <h3>识别到 {preview.parsed.length} 个班级，{preview.parsed.reduce((n,c)=>n+c.names.length,0)} 名队员</h3>
        {preview.parsed.map(item=><details key={item.id}><summary>{item.id}：{item.names.length} 人</summary><p>{item.note}</p><p>{item.names.join('、') || '空班'}</p></details>)}
        <ul>{preview.changes.map((change,i)=><li key={i}>{change}</li>)}</ul>
        <p>计划处理 {Object.keys(preview.next).length} 个班级，共 {Object.values(preview.next).reduce((n,rows)=>n+rows.filter(m=>m.name).length,0)} 名实名队员。{importMode==='recover' ? '只恢复或合并，不移除现有实名队员。' : '完整替换模式，请核对人员移出和转班。'} 历史考勤不删除，训练日期和时间不变。</p>
        <button disabled={saving||!writable} onClick={async()=>{
          if(savingRef.current)return;savingRef.current=true;setSaving(true);
          try {const saved=await persistRosters(preview.next,previewExpected??rosters);setRosters(saved);setPreview(null);setImportText('');setMessage(academicCloudEnabled?'名单已导入腾讯云，队员 ID 与历史考勤保留。':'名单已导入本地，队员 ID 与历史考勤保留。');}
          catch(error){setMessage('未导入：'+String(error));}
          finally{savingRef.current=false;setSaving(false);}
        }}>确认以上变化并导入</button>
      </section>}
    </details>}
    <p role="status">{message}</p>
    <div className={styles.filters}>
      <label>训练日期 <select value={day} onChange={event => setDay(event.target.value)}>{['全部', '周四', '周五', '周六', '周日'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>教练 <select value={coach} onChange={event => setCoach(event.target.value)}>{['全部', 'B', 'V', 'G'].map(value => <option key={value} value={value}>{coachNames[value] || value}</option>)}</select></label>
      <span role="status">显示 {visible.length} 个班级</span>
    </div>
    {coachGroups.map(group => <section className={styles.coachGroup} key={group.key} aria-labelledby={`class-coach-${group.key}`}>
      <div className={styles.coachHeading}>
        <h3 id={`class-coach-${group.key}`}>{group.name} 教练</h3>
        <span>{group.items.length} 个班级 · {group.items.reduce((total, item) => total + item.count, 0)} 名学员</span>
      </div>
      <div className={cabin.grid}>{group.items.map(item => <article className={cabin.card} key={item.id} data-class-card data-class-full={item.count >= 4 && item.seats === 0 ? 'true' : undefined} data-class-underfilled={item.count < 4 ? 'true' : undefined}>
      <button className={styles.cardOpen} type="button" aria-label={`查看 ${item.id} 队员`} onClick={() => setSelected(item.id)} />
      <div className={cabin.top}><span>CLASS CABIN / 班级舱</span><span data-class-full={item.count >= 4 && item.seats === 0 ? 'true' : undefined} data-class-warning={item.count < 4 ? 'true' : undefined} className={item.count < 4 ? cabin.lowCount : item.seats===0 ? cabin.full : cabin.status}>{item.count < 4 ? '人数不足 4 人' : item.seats === 0 ? '已满班' : '有空位'}</span></div>
      <div className={cabin.title}><h4>{item.id}</h4><span>{item.id.split('-')[0]} 级别</span></div>
      <dl className={cabin.instruments}><div><dt>训练时间 · {item.day}</dt><dd>{item.time}</dd></div><div><dt>教练 / COACH</dt><dd>{coachNames[item.coach]}</dd></div></dl>
      <div className={cabin.seating}>
        <div className={cabin.gauge} role="img" aria-label={`座位占用率 ${item.count+item.seats ? Math.round(item.count/(item.count+item.seats)*100) : 0}%，不是出勤率`}>
          <svg viewBox="0 0 120 78" aria-hidden="true">
            <path d="M 15 57 A 45 45 0 0 1 105 57" fill="none" stroke="#c8d5d7" strokeWidth="7" />
            <path d="M 15 57 A 45 45 0 0 1 105 57" fill="none" stroke="#537e85" strokeWidth="7" pathLength="100" strokeDasharray={`${item.count+item.seats ? item.count/(item.count+item.seats)*100 : 0} 100`} />
            {Array.from({length:11},(_,i)=><line key={i} x1="15" y1="57" x2={i%5===0?'7':'10'} y2="57" transform={`rotate(${i*18} 60 57)`} stroke="#526a75" strokeWidth={i%5===0?2:1} />)}
            <line x1="60" y1="57" x2="25" y2="57" transform={`rotate(${item.count+item.seats ? item.count/(item.count+item.seats)*180 : 0} 60 57)`} stroke="#ad4a23" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="60" cy="57" r="4" fill="#344f5b" />
            <text x="12" y="73" textAnchor="middle">0</text><text x="105" y="73" textAnchor="middle">100</text>
          </svg>
          <span>座位占用 <b>{item.count+item.seats ? Math.round(item.count/(item.count+item.seats)*100) : 0}%</b></span>
        </div>
        <div><span>班级座位</span><strong data-class-count>{item.count}<small> 人在班</small></strong></div><div className={cabin.seats} aria-label={`在班 ${item.count} 人，空位 ${item.seats} 个`}>{Array.from({length:item.count+item.seats},(_,i)=><span key={i} aria-hidden="true" className={i<item.count?cabin.occupied:cabin.empty} />)}</div><span className={cabin.vacancy}>空位 <b>{item.seats}</b></span></div>
      <div className={cabin.footer}><span>查看队员 · 管理班级</span><span aria-hidden="true">进入舱位 ↗</span></div>
      </article>)}</div>
    </section>)}
    {visible.length === 0 && <p>当前筛选条件下没有班级，请调整日期或教练。</p>}
    <p className={styles.footnote}>{academicCloudEnabled?'云端名册 · 仅登录后可读取负责班级；已有本地数据请通过上方迁移入口核对添加。':'本地预览：队员数据仅在当前浏览器，请保留备份。'}</p>
  </div>;
}
