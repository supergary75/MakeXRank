import {useEffect,useState,useRef} from 'react';
import type {AuthUserProfile} from '../types';
import {monthlyCurriculum, type MonthPlan} from '../../shared/monthlyCurriculum.mjs';
import {curriculumApi,type CurriculumWorkspace,type CurriculumVersion} from '../services/curriculumService';
const fields=[['title','学习主题',100],['learning','学习重点',4000],['practice','练习任务',4000],['evidence','阶段成果',2000]] as const;
const actionLabels:Record<string,string>={initial:'初始版本',save:'保存讨论稿',submit:'提交审核',publish:'发布',return:'退回修改',restore:'恢复版本'};

export default function MonthlyCurriculum({level,user,onLogin}:{level:string;user?:AuthUserProfile|null;onLogin:()=>void}) {
  const [months,setMonths]=useState(monthlyCurriculum[level]);
  const [workspace,setWorkspace]=useState<CurriculumWorkspace|null>(null);
  const [message,setMessage]=useState('正在读取课程内容…');
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  const [busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<number|null>(null);
  const [form,setForm]=useState<MonthPlan|null>(null);
  const [original,setOriginal]=useState('');
  const [history,setHistory]=useState<{month:number;versions:CurriculumVersion[]}|null>(null);
  const [reviewNote,setReviewNote]=useState('');
  const editorRef=useRef<HTMLElement>(null);
  useEffect(()=>{if(editing!==null)editorRef.current?.scrollIntoView({behavior:'smooth',block:'start'});},[editing]);
  const dirty=form!==null&&JSON.stringify(form)!==original;
  useEffect(()=>{
    let alive=true;
    (async()=>{try{
      const published=await curriculumApi.published(level);
      if(!alive)return;setMonths(published.months);setMessage('已连接 · 当前显示已发布内容');setError('');
      if(user){const work=await curriculumApi.workspace(level);if(alive)setWorkspace(work);}
    }catch(e){if(alive){setWorkspace(null);setError(e instanceof Error?e.message:'连接失败，请重试');setMessage('未能完成同步；当前内容可能不是最新版本');}}})();
    return()=>{alive=false;};
  },[level,user,reload]);
  useEffect(()=>{if(!dirty)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
  const mayLeave=()=>!dirty||window.confirm('有尚未保存的修改，确定放弃这些修改吗？');
  const close=()=>{if(mayLeave()){setEditing(null);setForm(null);setHistory(null);}};
  const open=(month:number)=>{if(!mayLeave())return;const row=workspace?.months.find(r=>r.month===month);if(!row)return;const content=row.draft||row.published;setEditing(month);setForm({...content});setOriginal(JSON.stringify(content));setHistory(null);setReviewNote('');setError('');};
  const act=async(action:string,version?:number)=>{
    if(editing===null||!workspace||busy)return;
    const row=workspace.months.find(r=>r.month===editing);if(!row)return;
    setBusy(true);setError('');
    try{
      const saved=await curriculumApi.act(level,editing,{action,revision:row.revision,...(action==='save'&&form?{content:form}:{}),...(action==='return'?{note:reviewNote}:{}),...(version!==undefined?{version}:{})});
      setWorkspace({...workspace,months:workspace.months.map(r=>r.month===editing?saved:r)});
      setMonths(current=>current.map((m,i)=>i+1===editing?saved.published:m));
      const content=saved.draft||saved.published;setForm({...content});setOriginal(JSON.stringify(content));setHistory(null);
      setMessage(action==='save'?'草稿已保存到服务器，正式内容尚未改变':action==='submit'?'已提交，等讨论中 · 待 Gary 确认':action==='return'?'已退回修改':action==='restore'?'历史版本已恢复并发布':'已发布，其他设备重新读取后即可看到');
    }catch(e){setError(e instanceof Error?e.message:'保存失败，输入内容已保留');}finally{setBusy(false);}
  };
  const showHistory=async()=>{if(editing===null||busy)return;setBusy(true);try{setHistory({month:editing,versions:await curriculumApi.history(level,editing)});}catch(e){setError(e instanceof Error?e.message:'历史记录读取失败');}finally{setBusy(false);}};
  const current=workspace?.months.find(r=>r.month===editing);
  return <section aria-label={`${level}月度学习安排`} className="syllabus-months">
    <h3>1—12月 · 每月学习重点</h3><p>月份不代表官方赛期。外部赛事按实际日程穿插，8月和12月完成闭环评估；课次与假期由班级课表确定。此处维护级别标准大纲，班级实际进度单独安排。</p>
    <div className="curriculum-editor-status"><p role="status">{message}</p><button disabled={busy} onClick={()=>{if(mayLeave()){setEditing(null);setForm(null);setHistory(null);setReload(x=>x+1);}}}>重新读取</button>{!user&&<button onClick={onLogin}>教练登录编辑</button>}</div>
    {error&&<p role="alert" className="curriculum-editor-error">{error} {dirty?'未保存的输入仍保留在编辑区。':''}</p>}
    {workspace&&<p>{workspace.permissions.publish?'Gary：可编辑全部级别、审核发布和恢复历史版本。':workspace.permissions.edit?'你可以编辑本级别，保存讨论稿后提交讨论 / 待最终确认。':'当前账号仅可查看本级别已发布内容。'} {workspace.permissions.edit&&`本级别待审核 ${workspace.months.filter(r=>r.state==='submitted').length} 个月。`}</p>}
    {editing!==null&&form&&current&&<section ref={editorRef} className="curriculum-month-editor" aria-label={`${editing}月编辑区`}><h3>{level} · {editing}月 · {current.state==='submitted'?'待审核':current.state==='draft'?'草稿':'编辑已发布内容'}</h3>
      {current.note&&<p><b>审核意见：</b>{current.note}</p>}
      <p>讨论稿与正式大纲分开保存。请先完成团队讨论，再由 Gary 最终确认替换；提交本身不会改变正式内容。</p>
      <details open><summary>当前正式内容（替换前）</summary>{fields.map(([key,label])=><p key={key}><b>{label}：</b>{current.published[key]}</p>)}</details>
      <h4>教练讨论稿 · 尚未生效</h4>
      <form onSubmit={e=>{e.preventDefault();void act('save');}}>
        {fields.map(([key,label,max])=><label key={key}>{label}{key==='title'?<input required maxLength={max} value={form[key]} disabled={busy||(current.state==='submitted')} onChange={e=>setForm({...form,[key]:e.target.value})}/>:<textarea required rows={4} maxLength={max} value={form[key]} disabled={busy||(current.state==='submitted')} onChange={e=>setForm({...form,[key]:e.target.value})}/>}</label>)}
        <div className="curriculum-editor-actions"><button type="submit" disabled={busy||current.state==='submitted'}>保存讨论稿</button>{<button type="button" disabled={busy||dirty||current.state!=='draft'} onClick={()=>void act('submit')}>提交讨论 / 待最终确认</button>}{workspace?.permissions.publish&&<button type="button" disabled={busy||dirty||current.state!=='submitted'} onClick={()=>{if(window.confirm(`确认已经完成讨论，并用 ${level} ${editing}月已提交的讨论稿替换正式内容？`))void act('publish');}}>Gary 最终确认并替换</button>}<button type="button" disabled={busy} onClick={()=>void showHistory()}>历史版本</button><button type="button" disabled={busy} onClick={close}>关闭编辑</button></div>
        {dirty&&<p>有未保存修改；提交审核前请先保存讨论稿。</p>}
      </form>
      {workspace?.permissions.publish&&current.state==='submitted'&&<div><label>退回修改意见<textarea maxLength={1000} value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/></label><button disabled={busy||!reviewNote.trim()||dirty} onClick={()=>void act('return')}>退回教练修改</button></div>}
      {history&&<section aria-label="课程历史版本"><h4>{history.month}月历史记录（最近100次）</h4>{!history.versions.length&&<p>尚无修改记录</p>}{history.versions.map(v=><details key={v.revision}><summary>版本 {v.revision} · {actionLabels[v.action]||v.action} · {v.actor} · {new Date(v.created_at).toLocaleString()}</summary>{fields.map(([key,label])=><p key={key}><b>{label}：</b>{(v.draft||v.published)[key]}</p>)}{workspace?.permissions.publish&&['initial','publish','restore'].includes(v.action)&&<button disabled={busy||dirty||!!current.draft} onClick={()=>{if(window.confirm(`确认将 ${editing}月恢复为版本 ${v.revision}？本次恢复也会保留历史记录。`))void act('restore',v.revision);}}>恢复并发布此版本</button>}</details>)}</section>}
    </section>}
    {[{label:'第一闭环｜1—8月 · 综合培养',start:0,end:8},{label:'第二闭环｜9—12月 · 专项提升',start:8,end:12}].map(cycle=><section className={`curriculum-cycle-${cycle.start===0?'first':'second'}`} key={cycle.start} aria-label={cycle.label}><h4 className="syllabus-month-group">{cycle.label}</h4><div className="syllabus-month-grid">{months.slice(cycle.start,cycle.end).map((month,i)=>{const number=cycle.start+i+1;const row=workspace?.months.find(r=>r.month===number);return <article className="syllabus-month" key={number}><span className="syllabus-month-number">{number}月</span><h4>{month.title}</h4><p>{month.learning}</p><details><summary>查看练习与成果</summary><p><b>练习任务：</b>{month.practice}</p><p><b>阶段成果：</b>{month.evidence}</p></details>{workspace?.permissions.edit&&<><p className="curriculum-draft-status">{row?.state==='submitted'?'讨论中 · 待 Gary 确认':row?.state==='draft'?'有独立讨论稿':'已发布'}</p><button disabled={busy} onClick={()=>open(number)}>{row?.state==='submitted'?'查看讨论稿':'编辑讨论稿'}</button></>}</article>;})}</div></section>)}
  </section>;
}
