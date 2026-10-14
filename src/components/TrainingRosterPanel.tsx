import {useState} from 'react';
import {rosterChanges,type TrainingMember,type TrainingRoster} from './trainingRoster';
export default function TrainingRosterPanel({source,roster,canEdit,onSave}:{source:TrainingMember[];roster?:TrainingRoster;canEdit:boolean;onSave:(value:TrainingRoster)=>void}){
  const [editing,setEditing]=useState(false);
  const [selected,setSelected]=useState<string[]>([]);
  const changes=rosterChanges(roster?.source??[],source);
  const changed=changes.added.length+changes.removed.length+changes.updated.length;
  const options=[...source,...(roster?.members??[]).filter(r=>!source.some(s=>s.id===r.id))];
  return <section style={{padding:20,border:'1px solid #b9c9d3',borderRadius:12,background:'#f7fafc',color:'#183047',margin:'20px 0'}} aria-label="集训参训名单">
    <h3>本组参训名单</h3><p>报名资料来自赛事后勤；确认后的参训名单独立保留，报名变化不会自动增减参训人员。</p>
    {!roster?<p role="status">尚未确认参训名单，请核对本组报名队员。</p>:<><p>已确认 {roster.members.length} 人 · {new Date(roster.confirmedAt).toLocaleString()}</p><p>{roster.members.map(m=>m.name).join('、')||'暂未选择队员'}</p>{changed>0&&<p role="alert">报名变化：新增 {changes.added.length} 人，退出 {changes.removed.length} 人，资料变化 {changes.updated.length} 人。请核对，不会自动覆盖。</p>}</>}
    {canEdit&&!editing&&<button onClick={()=>{setSelected((roster?.members??source).map(m=>m.id));setEditing(true);}}>核对 / 调整参训名单</button>}
    {editing&&<><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}>{options.map(m=><label key={m.id} style={{padding:10}}><input type="checkbox" checked={selected.includes(m.id)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,m.id]:prev.filter(id=>id!==m.id))}/>{m.name} · {m.teamNo||m.teamName||'未分队'}{!source.some(s=>s.id===m.id)&&'（已退出报名，是否保留请确认）'}</label>)}</div><button onClick={()=>{onSave({members:options.filter(m=>selected.includes(m.id)),source:source.map(m=>({...m})),confirmedAt:new Date().toISOString()});setEditing(false);}}>确认本次参训名单</button><button onClick={()=>setEditing(false)}>取消</button></>}
  </section>;
}
