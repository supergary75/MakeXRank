import { readFile } from 'node:fs/promises';
import { createInterview, transitionInterview, reminderPlan, canRead, fail } from '../shared/interviewWorkflow.mjs';
import { defaultTemplates, updateTemplate } from '../shared/interviewTemplates.mjs';

export async function mountInterviewRoutes(app, pool, requireAuth) {
  await pool.query(await readFile(new URL('./interviews.sql', import.meta.url), 'utf8'));
  for (const template of defaultTemplates()) {
    await pool.query(`insert into interview_templates(id,version,payload) values($1,$2,$3) on conflict(id) do nothing`,[template.id,template.version,JSON.stringify(template)]);
    await pool.query(`insert into interview_template_versions(template_id,version,payload) values($1,$2,$3) on conflict(template_id,version) do nothing`,[template.id,template.version,JSON.stringify(template)]);
  }
  const staff = async (db, id = null) => (await db.query(`select s.user_id as id,
    (case when lower(p.username)='supergary' then 'supergary' else s.label end) as name,s.role,
    (s.role='manager' or s.label='Gary') as "canInitiate"
    from interview_staff s join user_profiles p on p.auth_user_id=s.user_id
    where s.active and p.is_active and ($1::uuid is null or s.user_id=$1)`, [id])).rows;
  const wrap = fn => async (req, res, next) => {
    try { await fn(req, res); } catch (e) {
      if (e.status) res.status(e.status).json({ message: e.message }); else next(e);
    }
  };
  app.use('/interviews', requireAuth, async (req, res, next) => {
    try {
      req.interviewActor = (await staff(pool, req.user.sub))[0];
      if (!req.interviewActor) return res.status(403).json({ message: '面试角色尚未绑定，请管理员核对 Lisa / 教练与现有账号的对应关系。' });
      next();
    } catch (e) { next(e); }
  });
  app.get('/interviews/context', wrap(async (req, res) => {
    res.json({ actor: req.interviewActor, staff: await staff(pool), capabilities: { templates: true, ai: false, pdf: false, reminders: true } });
  }));
  app.get('/interviews/templates', wrap(async (_req,res)=>{
    res.json((await pool.query('select payload from interview_templates order by id')).rows.map(row=>row.payload));
  }));
  app.post('/interviews/templates/:id', wrap(async (req,res)=>{
    if(!['u9','u12','u15','u18'].includes(req.params.id)) fail('模板不存在',404);
    const db=await pool.connect();
    try{
      await db.query('begin');
      const actor=(await staff(db,req.user.sub))[0];
      const row=(await db.query('select payload from interview_templates where id=$1 for update',[req.params.id])).rows[0];
      if(!row) fail('模板不存在',404);
      const next=updateTemplate(row.payload,req.body,actor);
      await db.query('insert into interview_template_versions(template_id,version,payload,created_by) values($1,$2,$3,$4)',[next.id,next.version,JSON.stringify(next),actor.id]);
      await db.query('update interview_templates set version=$1,payload=$2,updated_at=now(),updated_by=$3 where id=$4',[next.version,JSON.stringify(next),actor.id,next.id]);
      await db.query('commit'); res.json(next);
    }catch(e){await db.query('rollback');throw e;}finally{db.release();}
  }));
  app.get('/interviews', wrap(async (req, res) => {
    const { rows } = await pool.query('select payload from interviews where manager_id=$1 or coach_id=$1 order by updated_at desc', [req.user.sub]);
    res.json(rows.map(row => row.payload));
  }));
  app.get('/interviews/notifications', wrap(async (req, res) => {
    res.json((await pool.query(`select n.id,n.interview_id as "interviewId",n.message,n.created_at as "createdAt",n.read_at as "readAt"
      from interview_notifications n join interviews i on i.id=n.interview_id
      where n.recipient_id=$1 and (i.manager_id=$1 or i.coach_id=$1) order by n.created_at desc limit 200`, [req.user.sub])).rows);
  }));
  app.post('/interviews/notifications/read', wrap(async (req, res) => {
    if (typeof req.body.id !== 'string') fail('通知编号无效');
    await pool.query('update interview_notifications set read_at=now() where id=$1 and recipient_id=$2', [req.body.id, req.user.sub]);
    res.json({ ok: true });
  }));
  async function saveTasks(db, record, action, now) {
    if (['create','accept','propose','confirm_time','counter_time','start','finish','cancel','no_show','archive'].includes(action)) {
      await db.query("update interview_reminders set state='cancelled' where interview_id=$1 and state='pending'", [record.id]);
      for (const task of reminderPlan(record, now)) {
        await db.query(`insert into interview_reminders(id,interview_id,recipient_id,schedule_version,minutes,due_at)
          values($1,$2,$3,$4,$5,$6) on conflict(id) do nothing`, [task.key,record.id,record.coachId,record.scheduleVersion,task.minutes,task.dueAt]);
      }
    }
    if (action === 'save_report') return;
    const recipient = ['create','confirm_time','counter_time','cancel','no_show','archive'].includes(action) ? record.coachId : record.managerId;
    await db.query(`insert into interview_notifications(id,interview_id,recipient_id,message) values($1,$2,$3,$4) on conflict(id) do nothing`,
      [`${record.id}:${record.version}:${action}`,record.id,recipient,record.history.at(-1).label]);
  }
  app.post('/interviews', wrap(async (req, res) => {
    const db = await pool.connect();
    try {
      await db.query('begin');
      const actor = (await staff(db, req.user.sub))[0];
      if (!actor) fail('账号已停用',403);
      const now = new Date().toISOString();
      const record = createInterview(req.body, actor, await staff(db), now);
      const inserted = await db.query(`insert into interviews(id,manager_id,coach_id,version,payload) values($1,$2,$3,$4,$5) on conflict(id) do nothing returning id`,
        [record.id,record.managerId,record.coachId,record.version,JSON.stringify(record)]);
      if (!inserted.rowCount) fail('此提交编号已使用，请刷新列表确认结果，不要重复发起',409);
      await saveTasks(db,record,'create',now);
      await db.query('commit'); res.status(201).json(record);
    } catch (e) { await db.query('rollback'); throw e; } finally { db.release(); }
  }));
  app.post('/interviews/:id/actions', wrap(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) fail('面试编号无效');
    const db = await pool.connect();
    try {
      await db.query('begin');
      const actor = (await staff(db,req.user.sub))[0];
      if (!actor) fail('账号已停用',403);
      const previous = (await db.query('select payload from interviews where id=$1 and (manager_id=$2 or coach_id=$2) for update',[req.params.id,actor.id])).rows[0]?.payload;
      if (!previous || !canRead(previous,actor)) fail('面试不存在或无权访问',404);
      const now = new Date().toISOString();
      const record = transitionInterview(previous,actor,req.body,now);
      await db.query('update interviews set payload=$1,version=$2,archived_at=$3,updated_at=now() where id=$4',
        [JSON.stringify(record),record.version,record.archivedAt,record.id]);
      await saveTasks(db,record,req.body.action,now);
      await db.query('commit'); res.json(record);
    } catch (e) { await db.query('rollback'); throw e; } finally { db.release(); }
  }));
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    const db = await pool.connect().catch(() => null);
    if (!db) { running = false; return; }
    try {
      await db.query('begin');
      // Lock interview first, same order as transitions. Serializes changes and reminder emission.
      const due = (await db.query(`select distinct interview_id from interview_reminders where state='pending' and due_at<=now() limit 100`)).rows;
      for (const { interview_id: id } of due) {
        const record = (await db.query('select payload from interviews where id=$1 for update',[id])).rows[0]?.payload;
        const tasks = (await db.query("select * from interview_reminders where interview_id=$1 and state='pending' and due_at<=now() for update",[id])).rows;
        for (const task of tasks) {
          const activeCoach = (await staff(db,task.recipient_id))[0];
          const valid = record?.status === 'confirmed' && record.scheduleVersion === task.schedule_version && record.coachId === task.recipient_id && activeCoach?.role === 'coach' && Date.parse(record.scheduledAt)>Date.now();
          if (valid) await db.query(`insert into interview_notifications(id,interview_id,recipient_id,message) values($1,$2,$3,$4) on conflict(id) do nothing`,
            [task.id,id,task.recipient_id,`面试提醒：预约前 ${task.minutes===1440?'24 小时':`${task.minutes} 分钟`}，请查看安排。`]);
          await db.query('update interview_reminders set state=$1 where id=$2',[valid?'sent':'cancelled',task.id]);
        }
      }
      await db.query('commit');
    } catch { await db.query('rollback'); console.error('Interview reminder transaction failed; will retry next interval.'); }
    finally { db.release(); running = false; }
  };
  const timer = setInterval(() => { void tick(); }, 30000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
