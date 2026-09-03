import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { canRead, createInterview, progressStep, STAGES, transitionInterview, type Interview, type Staff } from '../../../shared/interviewWorkflow.mjs';
import { canEditTemplate, defaultTemplates, updateTemplate, type InterviewTemplate } from '../../../shared/interviewTemplates.mjs';
import { interviewApi, type InterviewNotice } from '../../services/interviewService';
import styles from './InterviewCenter.module.css';

const demoStaff: Staff[] = ['Lisa', 'Gary', 'Brook', 'Jason', 'Vincent'].map((name, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, name,
  role: i === 0 ? 'manager' : 'coach', canInitiate: i < 2,
}));
const columns = [
  ['待响应 / 改期', ['pending_coach', 'pending_lisa']],
  ['待面试 / 面试中', ['confirmed', 'in_progress']],
  ['报告 / 交付', ['report_draft', 'report_finalized', 'pdf_ready']],
  ['待归档', ['delivered', 'cancelled', 'no_show']],
] as const;
const formatTime = (date: string) => new Date(date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function demoRecords(): Interview[] {
  const future = new Date(Date.now() + 86400000 * 2).toISOString();
  return ['体验学员 A', '体验学员 B'].map((name, i) => {
    const record = createInterview({ id: crypto.randomUUID(), studentName: name, grade: '三年级', course: '机器人课程', coachId: demoStaff[i + 1].id, scheduledAt: future }, demoStaff[0], demoStaff);
    return i ? record : transitionInterview(record, demoStaff[1], { action: 'accept', version: record.version });
  });
}

export function InterviewCenter({ accountId, onLogin }: { accountId?: string; onLogin: () => void }) {
  const [demo, setDemo] = useState(false);
  const [demoRole, setDemoRole] = useState(demoStaff[1].id);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [realActor, setRealActor] = useState<Staff | null>(null);
  const [records, setRecords] = useState<Interview[]>([]);
  const [notices, setNotices] = useState<InterviewNotice[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'board' | 'calendar' | 'archives' | 'notices' | 'templates'>('board');
  const [templates, setTemplates] = useState<InterviewTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<InterviewTemplate | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [feedback, setFeedback] = useState('');
  const requestEpoch = useRef(0);
  const mutationLock = useRef(false);
  const actor = demo ? demoStaff.find(s => s.id === demoRole)! : realActor;
  const members = demo ? demoStaff : staff;
  const name = (id: string) => members.find(s => s.id === id)?.name || '已绑定成员';
  const visible = actor ? records.filter(r => canRead(r, actor)) : [];
  const active = visible.filter(r => !r.archivedAt);
  const archived = visible.filter(r => r.archivedAt);
  const matches = (r: Interview) => `${r.studentName} ${r.id} ${r.course} ${name(r.coachId)} ${r.scheduledAt} ${formatTime(r.scheduledAt)}`.toLowerCase().includes(search.toLowerCase());
  const personalNotices = actor ? notices.filter(n => visible.some(r => r.id === n.interviewId)) : [];
  const detail = visible.find(r => r.id === selected);
  const nextOwner = (r: Interview) => ['pending_lisa', 'delivered', 'cancelled', 'no_show'].includes(r.status) ? name(r.managerId) : name(r.coachId);

  const load = useCallback(async () => {
    if (demo || !accountId) return;
    const epoch = ++requestEpoch.current;
    setLoading(true);
    try {
      const context = await interviewApi.context();
      const [items, messages, library] = await Promise.all([interviewApi.list(), interviewApi.notices(), interviewApi.templates()]);
      if (epoch !== requestEpoch.current) return;
      setRealActor(context.actor); setStaff(context.staff); setRecords(items); setNotices(messages); setTemplates(library); setError('');
    } catch (e) {
      if (epoch === requestEpoch.current) { setError(e instanceof Error ? e.message : '连接失败'); setRealActor(null); setRecords([]); setNotices([]); setTemplates([]); }
    } finally { if (epoch === requestEpoch.current) setLoading(false); }
  }, [demo, accountId]);
  useEffect(() => {
    const epochRef = requestEpoch;
    if (!demo) { void load(); const timer = setInterval(() => { if (!mutationLock.current) void load(); }, 30000); return () => { clearInterval(timer); epochRef.current++; }; }
  }, [demo, load]);
  useEffect(() => { if (!accountId && !demo) { setRealActor(null); setRecords([]); setNotices([]); } }, [accountId, demo]);

  function enterDemo() {
    requestEpoch.current++; setDemo(true); setLoading(false); setRecords(demoRecords()); setNotices([]); setTemplates(defaultTemplates()); setError(''); setSelected(null); setFeedback('');
  }
  function leaveDemo() {
    requestEpoch.current++; setRecords([]); setNotices([]); setTemplates([]); setSelected(null); setRealActor(null); setCreateOpen(false); setDemo(false); setFeedback('');
  }
  async function mutate(task: () => Promise<void>) {
    if (mutationLock.current) return;
    mutationLock.current = true; requestEpoch.current++; setBusy(true); setError(''); setFeedback('');
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(false); mutationLock.current = false; }
  }
  async function submitNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actor) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || '');
    await mutate(async () => {
      const input = { id: draftId, studentName: value('studentName'), grade: value('grade'), course: value('course'), coachId: value('coachId'),
        scheduledAt: `${value('scheduledAt')}:00+08:00`, location: value('location'), experience: value('experience'), notes: value('notes') };
      const result = demo ? createInterview(input, actor, members) : await interviewApi.create(input);
      setRecords(previous => [result, ...previous.filter(r => r.id !== result.id)]); setCreateOpen(false); setSelected(result.id);
      setFeedback(demo ? '已在演示中发起。未写入服务器、未向真实教练发邀请。' : '面试已保存，邀请已进入教练站内通知。');
    });
  }
  async function act(record: Interview, action: string, extra: { scheduledAt?: string; reason?: string; report?: string } = {}) {
    if (!actor) return;
    await mutate(async () => {
      const input = { action, version: record.version, ...extra };
      const result = demo ? transitionInterview(record, actor, input) : await interviewApi.act(record.id, input);
      setRecords(previous => previous.map(r => r.id === result.id ? result : r));
      if (action === 'archive') setSelected(null);
      setFeedback(`${demo ? '演示：' : ''}${result.history.at(-1)?.label}。${action === 'archive' ? '已移入文档归档，资料保留。' : ''}`);
    });
  }

  return <section className={styles.workspace}>
    <div className={styles.topline}>
      <div><p className={styles.eyebrow}>INTERVIEW WORKSPACE</p><h2>让每一次面试，有序推进</h2><p className={styles.muted}>从邀约到归档，每个节点都有负责人。统一使用北京时间。</p></div>
      <button className={styles.primary} disabled={!actor?.canInitiate || busy} onClick={() => { setDraftId(crypto.randomUUID()); setCreateOpen(true); }}>＋ 发起面试</button>
    </div>
    <div className={demo ? styles.demoBanner : styles.connection}>
      {demo ? <><div><strong>演示模式 · 仅使用虚构学员</strong><p>仅保留在当前页面内存，刷新即重置；不会发送真实邀请或提醒。请勿输入真实个人资料。</p></div>
        <label>体验身份<select aria-label="演示身份" disabled={busy} value={demoRole} onChange={e => { setDemoRole(e.target.value); setSelected(null); setCreateOpen(false); setFeedback(''); }}>{demoStaff.map(s => <option key={s.id} value={s.id}>{s.name}{s.canInitiate ? ' · 可发起' : ' · 教练'}</option>)}</select></label><button disabled={busy} onClick={leaveDemo}>退出演示</button></>
        : <><div><strong>{loading ? '正在连接面试服务…' : actor ? `${actor.name} · ${actor.canInitiate ? '可发起面试' : '教练工作台'}` : '真实工作台尚未连接'}</strong><p>{actor ? '站内通知由服务器保存；网页每 30 秒刷新。' : '需要连接第一方 API，并将现有账号绑定为 Lisa 或指定教练。Gary 绑定后也可发起。'}</p></div><div className={styles.actions}>{!accountId && <button onClick={onLogin}>登录账号</button>}<button disabled={loading || busy || !accountId} onClick={() => void load()}>重新连接</button><button onClick={enterDemo} disabled={busy}>体验演示流程</button></div></>}
    </div>
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {feedback && <div role="status" className={styles.success}>{feedback}</div>}
    <div className={styles.metrics}>
      {[['进行中', active.length], ['待我处理', active.filter(r => (r.managerId === actor?.id && ['pending_lisa','delivered','cancelled','no_show'].includes(r.status)) || (r.coachId === actor?.id && ['pending_coach','report_draft'].includes(r.status))).length], ['待归档', active.filter(r => ['delivered','cancelled','no_show'].includes(r.status)).length], ['已归档', archived.length]].map(([label,count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}
    </div>
    <div className={styles.toolbar}>
      <nav aria-label="面试工作台栏目">{([['board','进度看板'],['calendar','面试日程'],['archives','文档归档'],['notices','我的通知'],['templates','模板库']] as const).map(([key,label]) => <button key={key} aria-pressed={tab === key} className={tab === key ? styles.selected : ''} onClick={() => { setTab(key); setSearch(''); }}>{label}</button>)}</nav>
      {!['notices','templates'].includes(tab) && <input aria-label="搜索面试" placeholder="搜索学员、教练、编号或日期" value={search} onChange={e => setSearch(e.target.value)} />}
    </div>
    {tab === 'board' && <div className={styles.board}>{columns.map(([label,statuses]) => {
      const items = active.filter(r => (statuses as readonly string[]).includes(r.status) && matches(r));
      return <section className={styles.column} key={label}><h3>{label}<span>{items.length}</span></h3>{items.map(r => <button key={r.id} className={styles.card} onClick={() => setSelected(r.id)}>
        <span className={styles.tag}>{STAGES[r.status]}</span><h4>{r.studentName}</h4><p>{r.grade} · {r.course}</p><p>{formatTime(r.scheduledAt)}</p><p>教练 {name(r.coachId)} · 发起人 {name(r.managerId)}</p>
        <div className={styles.progress} aria-label={`进度：${STAGES[r.status]}`}>{[1,2,3,4,5,6].map(step => <i key={step} className={step <= progressStep(r) ? styles.done : ''} />)}</div>
        {r.proposedAt && <p className={styles.warning}>改期提议：{formatTime(r.proposedAt)}</p>}
        {['confirmed','in_progress','report_draft'].includes(r.status) && <p className={styles.warning}>模板待配置</p>}
        {['pending_coach','confirmed'].includes(r.status) && Date.parse(r.scheduledAt)<Date.now() && <p className={styles.warning}>预约时间已过，请跟进</p>}
        <footer>下一责任人：{nextOwner(r)} <span>查看 →</span></footer><small>更新于 {formatTime(r.updatedAt)}</small>
      </button>)}{!items.length && <p className={styles.emptyColumn}>{search ? '没有匹配记录' : '暂无面试'}</p>}</section>;
    })}</div>}
    {tab === 'calendar' && <div className={styles.list}>{active.filter(matches).sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt)).map(r => <button key={r.id} onClick={() => setSelected(r.id)}><strong>{formatTime(r.scheduledAt)}</strong><span>{r.studentName} · {name(r.coachId)}</span><span>{STAGES[r.status]} →</span></button>)}{!active.filter(matches).length && <p className={styles.empty}>暂无面试日程。确认预约后可在这里查看安排。</p>}</div>}
    {tab === 'archives' && <div className={styles.list}>{archived.filter(matches).map(r => <button key={r.id} onClick={() => setSelected(r.id)}><strong>{r.studentName}</strong><span>{name(r.coachId)} · {formatTime(r.archivedAt!)} · {r.archivedStatus === 'cancelled' ? '取消结案' : r.archivedStatus === 'no_show' ? '未到场结案' : '报告归档'}</span><span>查看档案 →</span></button>)}{!archived.filter(matches).length && <p className={styles.empty}>暂无归档资料。归档不是删除，完成归档后才会从看板移出。</p>}</div>}
    {tab === 'notices' && <div className={styles.list}>{personalNotices.map(n => <article key={n.id}><strong>{n.message}</strong><p>{formatTime(n.createdAt)} · {n.readAt ? '已读' : '未读'}</p><div className={styles.actions}><button onClick={() => setSelected(n.interviewId)}>查看面试</button>{!n.readAt && <button disabled={busy} onClick={() => void mutate(async () => { await interviewApi.markRead(n.id); setNotices(items => items.map(item => item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item)); })}>标为已读</button>}</div></article>)}{!personalNotices.length && <p className={styles.empty}>{demo ? '演示模式不发送通知，请切换体验身份处理邀请。' : '暂无站内通知。邀请、改期和提醒将在接入服务后显示。'}</p>}</div>}
    {tab === 'templates' && <section><div className={styles.libraryHeader}><div><h3>面试报告模板库</h3><p className={styles.muted}>U9/U12：Brook、Jason；U15：Vincent；U18：Gary。Gary 可编辑全部模板，Lisa 只读。</p></div><span>{actor && templates.some(template=>canEditTemplate(template,actor)) ? '部分或全部可编辑' : '只读权限'}</span></div><div className={styles.templateGrid}>{templates.map(template => <article className={styles.templateCard} key={template.id}><div><span className={styles.level}>{template.level}</span><span>版本 {template.version}</span></div><h3>{template.name}</h3><p>{template.description || '暂无模板说明'}</p><ol>{template.sections.map(section => <li key={section}>{section}</li>)}</ol><footer><small>更新：{formatTime(template.updatedAt)}</small>{actor && canEditTemplate(template,actor) ? <button disabled={busy} onClick={() => setEditingTemplate(template)}>编辑模板</button> : <span className={styles.readOnly}>只读</span>}</footer></article>)}</div>{!templates.length && <p className={styles.empty}>模板库尚未连接。可进入演示模式查看四个基础模板。</p>}</section>}
    <aside className={styles.roadmap}><strong>分阶段接入</strong><span>预约协作与看板：已开发</span><span>U9–U18 模板库：已开发</span><span>模板题目与评分标准：由授权人员维护</span><span>AI 留言 / 正式报告 PDF：待接入</span></aside>
    {createOpen && actor && <div className={styles.overlay}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="new-interview-title"><div className={styles.topline}><h2 id="new-interview-title">发起面试</h2><button disabled={busy} onClick={() => setCreateOpen(false)}>关闭</button></div><p className={styles.muted}>发起人 {actor.name} · {demo ? '演示数据，不发送真实邀请' : '保存后通知指派教练'}</p>
      <form onSubmit={submitNew}><fieldset disabled={busy}><div className={styles.formGrid}>
        <label>学员姓名<input name="studentName" required maxLength={80} placeholder={demo ? '请填写虚构姓名' : '姓名'} /></label><label>年龄 / 年级<input name="grade" required maxLength={80} /></label>
        <label>意向课程<input name="course" required maxLength={120} /></label><label>指派教练<select name="coachId" required defaultValue=""><option value="" disabled>请选择教练</option>{members.filter(s => s.role === 'coach').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>面试时间（北京时间）<input name="scheduledAt" type="datetime-local" required /></label><label>地点 / 线上方式<input name="location" maxLength={200} /></label>
      </div><label>学习经历<textarea name="experience" maxLength={2000} rows={3} /></label><label>补充备注<textarea name="notes" maxLength={2000} rows={3} /></label>
      {error && <p role="alert" className={styles.error}>{error}</p>}<button className={styles.primary} type="submit">{busy ? '正在保存…' : demo ? '创建演示面试' : '提交并发送邀请'}</button></fieldset></form>
    </section></div>}
    {detail && actor && <InterviewDetail key={`${detail.id}:${actor.id}`} record={detail} actor={actor} name={name} busy={busy} error={error} onClose={() => setSelected(null)} onAction={act} />}
    {editingTemplate && actor && <TemplateEditor template={editingTemplate} busy={busy} onClose={() => setEditingTemplate(null)} onSave={input => void mutate(async () => { const next = demo ? updateTemplate(editingTemplate,input,actor) : await interviewApi.updateTemplate(editingTemplate.id,input); setTemplates(items => items.map(item => item.id === next.id ? next : item)); setEditingTemplate(null); setFeedback(`${next.level} 模板已更新为版本 ${next.version}。`); })} />}
  </section>;
}

function TemplateEditor({ template, busy, onClose, onSave }: { template:InterviewTemplate; busy:boolean; onClose:()=>void; onSave:(input:{version:number;name:string;description:string;sections:string[]})=>void }) {
  const [name,setName]=useState(template.name); const [description,setDescription]=useState(template.description); const [sections,setSections]=useState(template.sections.join('\n'));
  return <div className={styles.overlay}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="template-editor-title"><div className={styles.topline}><div><span className={styles.level}>{template.level}</span><h2 id="template-editor-title">编辑报告模板</h2></div><button disabled={busy} onClick={onClose}>关闭</button></div><p className={styles.muted}>当前版本 {template.version}。保存后生成新版本；已使用旧版的历史报告不受影响。</p><form onSubmit={event=>{event.preventDefault();onSave({version:template.version,name,description,sections:sections.split('\n').map(item=>item.trim()).filter(Boolean)});}}><fieldset disabled={busy}><label>模板名称<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} /></label><label>模板说明<textarea rows={3} maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} /></label><label>报告栏目（每行一个）<textarea rows={9} required value={sections} onChange={e=>setSections(e.target.value)} /></label><button className={styles.primary} type="submit">{busy?'正在保存…':'保存新版本'}</button></fieldset></form></section></div>;
}

function InterviewDetail({ record:r, actor, name, busy, error, onClose, onAction }: { record: Interview; actor: Staff; name: (id:string)=>string; busy:boolean; error:string; onClose:()=>void; onAction:(r:Interview, action:string, extra?:{scheduledAt?:string;reason?:string;report?:string})=>Promise<void> }) {
  const timeRef = useRef<HTMLInputElement>(null);
  const [reason, setReason] = useState('');
  const [report, setReport] = useState(r.report);
  const manager = actor.canInitiate && r.managerId === actor.id;
  const coach = actor.role === 'coach' && r.coachId === actor.id;
  const changeTime = (action:string) => {
    const time = timeRef.current?.value || '';
    if (!time) return;
    void onAction(r,action,{scheduledAt:`${time}:00+08:00`});
  };
  return <div className={styles.overlay}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="interview-detail-title"><div className={styles.topline}><div><span className={styles.tag}>{STAGES[r.status]}</span><h2 id="interview-detail-title">{r.studentName} · 面试详情</h2></div><button disabled={busy} onClick={onClose}>关闭</button></div>
    <p className={styles.muted}>编号 {r.id} · 版本 {r.version}</p><div className={styles.detailGrid}><p>预约时间<strong>{formatTime(r.scheduledAt)}（北京时间）</strong></p><p>责任人<strong>发起人 {name(r.managerId)} / 教练 {name(r.coachId)}</strong></p><p>学员信息<strong>{r.grade} / {r.course}</strong></p><p>面试方式<strong>{r.location || '尚未填写'}</strong></p></div>
    <p>学习经历：{r.experience || '暂无'}</p><p>备注：{r.notes || '暂无'}</p>
    {r.proposedAt && <p className={styles.warning}>教练提议的新时间：{formatTime(r.proposedAt)}，等待发起人确认。</p>}
    {r.archivedAt ? <><div className={styles.success}>已归档于 {formatTime(r.archivedAt)}。归档编号：{r.archiveNumber}<p>结案原因：{r.closureReason}</p><p>本条为结案资料，未生成正式面试报告 PDF。</p></div>{r.report && <div className={styles.controlBlock}><h3>归档的面试观察草稿</h3><div className={styles.archivedReport}>{r.report}</div></div>}</> : <fieldset disabled={busy}>
      <div className={styles.actions}>
        {coach && r.status==='pending_coach' && <button className={styles.primary} onClick={()=>void onAction(r,'accept')}>接受面试</button>}
        {manager && r.status==='pending_lisa' && <button className={styles.primary} onClick={()=>void onAction(r,'confirm_time')}>确认教练的新时间</button>}
        {coach && r.status==='confirmed' && <button className={styles.primary} onClick={()=>void onAction(r,'start')}>开始面试</button>}
        {coach && r.status==='in_progress' && <button className={styles.primary} onClick={()=>void onAction(r,'finish')}>结束面试，填写报告</button>}
      </div>
      {((coach && ['pending_coach','confirmed'].includes(r.status)) || (manager && ['pending_lisa','confirmed','pending_coach'].includes(r.status))) && <div className={styles.controlBlock}><label>调整时间（北京时间）<input ref={timeRef} type="datetime-local" required /></label><div className={styles.actions}>{coach && ['pending_coach','confirmed'].includes(r.status) && <button onClick={()=>changeTime('propose')}>提议改期，交发起人确认</button>}{manager && <button onClick={()=>changeTime('counter_time')}>提出新时间，交教练确认</button>}</div></div>}
      {r.status==='report_draft' && <div className={styles.controlBlock}><h3>面试观察草稿</h3><p className={styles.warning}>正式模板待开发。可保存观察记录，暂不能完成正式报告、调用 AI 或生成 PDF。</p><label>观察与留言草稿<textarea rows={7} value={report} readOnly={!coach} maxLength={20000} onChange={e=>setReport(e.target.value)} /></label>{coach && <button onClick={()=>void onAction(r,'save_report',{report})}>保存报告草稿</button>}</div>}
      {manager && ['pending_coach','pending_lisa','confirmed','in_progress','report_draft'].includes(r.status) && <details className={styles.controlBlock}><summary>取消 / 未到场结案</summary><label>结案原因<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></label><div className={styles.actions}><button disabled={!reason.trim()} onClick={()=>void onAction(r,'cancel',{reason})}>确认取消面试</button><button disabled={!reason.trim()} onClick={()=>void onAction(r,'no_show',{reason})}>确认未到场</button></div></details>}
      {['cancelled','no_show'].includes(r.status) && <div className={styles.controlBlock}><p>结案原因：{r.closureReason}</p>{manager && <button onClick={()=>void onAction(r,'archive')}>确认归档并移出看板</button>}</div>}
    </fieldset>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <h3>流程记录</h3><ol className={styles.timeline}>{r.history.map((item,i)=><li key={i}><strong>{item.label}</strong><p>{name(item.actorId)} · {formatTime(item.at)}</p>{item.proposedAt && <small>提议时间 {formatTime(item.proposedAt)}</small>}{item.reason && <p>{item.reason}</p>}</li>)}</ol>
  </section></div>;
}
