import { readFile } from 'node:fs/promises';
import { academicAccess } from '../shared/classDirectory.mjs';
import { allowedClasses, attendanceRecord, fail, importedRecord, members, requireClass, revision, validDate } from './academic-workflow.mjs';
import { makeupPlanError } from '../shared/makeupPlans.mjs';

const makeupColumns = `class_id,to_char(lesson_date,'YYYY-MM-DD') as date,session,member_id,revision,plan,updated_at as "updatedAt",updated_by as actor`;

export async function mountAcademicRoutes(app, pool, requireAuth) {
  await pool.query(await readFile(new URL('./academic.sql',import.meta.url),'utf8'));
  const wrap = fn => async(req,res,next) => {
    res.set('Cache-Control','no-store, private');
    try { if(req.method==='POST'&&(!req.body||typeof req.body!=='object'||Array.isArray(req.body)))fail(400,'请求内容必须是有效 JSON 对象。');await fn(req,res); } catch(error) { if(error.status)res.status(error.status).json({message:error.message});else next(error); }
  };
  async function actorOf(req, db=pool) {
    const actor=(await db.query('select auth_user_id,username,role,is_active from user_profiles where auth_user_id=$1',[req.user.sub])).rows[0];
    if(!actor?.is_active)fail(401,'请重新登录。');
    return actor;
  }
  async function transaction(task) {
    const db=await pool.connect();
    try { await db.query('begin');await db.query("set local statement_timeout='8s'");const result=await task(db);await db.query('commit');return result; }
    catch(error) { await db.query('rollback');throw error; } finally { db.release(); }
  }
  const lock = (db,key) => db.query('select pg_advisory_xact_lock(hashtext($1))',[`academic:${key}`]);
  const audit = (db,kind,key,rev,snapshot,actor) => db.query('insert into academic_changes(kind,document_key,revision,snapshot,actor) values($1,$2,$3,$4,$5)',[kind,key,rev,JSON.stringify(snapshot),actor.username]);
  function lesson(req) {
    const {classId,date,session}=req.params;
    if(!validDate(date)||!['regular','extra1','extra2'].includes(session))fail(400,'日期或课次不正确。');
    return {classId,date,session};
  }
  app.get('/academic/snapshot',requireAuth,wrap(async(req,res)=>{
    const actor=await actorOf(req), ids=allowedClasses(actor);
    const [rosters,attendance,holidays,makeups]=await Promise.all([
      pool.query('select class_id,revision,members from academic_rosters where class_id=any($1::text[]) order by class_id',[ids]),
      pool.query("select class_id,to_char(lesson_date,'YYYY-MM-DD') as date,session,revision,record from academic_attendance where class_id=any($1::text[]) order by lesson_date,class_id,session",[ids]),
      pool.query("select to_char(lesson_date,'YYYY-MM-DD') as date,revision,active,note,actor,updated_at as \"updatedAt\" from academic_holidays order by lesson_date"),
      pool.query(`select ${makeupColumns} from academic_makeups where class_id=any($1::text[]) order by lesson_date,class_id,session,member_id`,[ids]),
    ]);
    res.json({permissions:academicAccess(actor),classIds:ids,rosters:rosters.rows,attendance:attendance.rows,holidays:holidays.rows,makeups:makeups.rows});
  }));
  app.post('/academic/rosters',requireAuth,wrap(async(req,res)=>{
    const changes=req.body.changes;
    if(!changes || typeof changes!=='object' || Array.isArray(changes) || !Object.keys(changes).length || Object.keys(changes).length>100)fail(400,'请选择需要保存的班级。');
    const result=await transaction(async db=>{
      const actor=await actorOf(req,db), saved=[];
      for(const id of Object.keys(changes).sort()) {
        requireClass(actor,id,true);const list=members(changes[id]);
        await lock(db,`roster:${id}`);
        const previous=(await db.query('select revision from academic_rosters where class_id=$1',[id])).rows[0];
        revision(req.body.revisions?.[id],previous?.revision ?? 0);
        const next=(await db.query('insert into academic_rosters(class_id,revision,members,updated_by) values($1,$2,$3,$4) on conflict(class_id) do update set revision=excluded.revision,members=excluded.members,updated_by=excluded.updated_by,updated_at=now() returning class_id,revision,members',[id,(previous?.revision ?? 0)+1,JSON.stringify(list),actor.username])).rows[0];
        await audit(db,'roster',id,next.revision,list,actor);saved.push(next);
      }
      return saved;
    });res.json({rosters:result});
  }));
  app.post('/academic/attendance/:classId/:date/:session',requireAuth,wrap(async(req,res)=>{
    const {classId,date,session}=lesson(req);
    const result=await transaction(async db=>{
      const actor=await actorOf(req,db);requireClass(actor,classId,true);
      await lock(db,`day:${date}`);
      if((await db.query('select 1 from academic_holidays where lesson_date=$1 and active',[date])).rowCount)fail(409,'当天俱乐部放假，不能提交或保存点名。');
      const previous=(await db.query('select revision,record from academic_attendance where class_id=$1 and lesson_date=$2 and session=$3',[classId,date,session])).rows[0];
      revision(req.body.revision,previous?.revision ?? 0);
      const record=attendanceRecord(previous?.record,req.body,actor,date);
      const rosters=(await db.query('select members from academic_rosters where class_id=any($1::text[])',[allowedClasses(actor)])).rows;
      const own=(await db.query('select members from academic_rosters where class_id=$1',[classId])).rows[0]?.members ?? [];
      for(const row of record.rows) {
        const identity=(previous?.record.rows ?? []).find(m=>m.id===row.id) || own.find(m=>m.id===row.id) || (row.temporary && rosters.flatMap(r=>r.members).find(m=>m.id===row.id));
        if(!identity || identity.name!==row.name)fail(409,'名单已变化或包含无权访问的队员。请重新加载名单后核对。');
      }
      const next=(await db.query('insert into academic_attendance(class_id,lesson_date,session,revision,record,updated_by) values($1,$2,$3,$4,$5,$6) on conflict(class_id,lesson_date,session) do update set revision=excluded.revision,record=excluded.record,updated_by=excluded.updated_by,updated_at=now() returning revision,record',[classId,date,session,(previous?.revision ?? 0)+1,JSON.stringify(record),actor.username])).rows[0];
      await audit(db,'attendance',`${classId}:${date}:${session}`,next.revision,record,actor);return next;
    });res.json(result);
  }));
  app.post('/academic/makeups/:classId/:date/:session/:memberId',requireAuth,wrap(async(req,res)=>{
    const {classId,date,session}=lesson(req), memberId=req.params.memberId;
    if(!/^[a-zA-Z0-9_-]{1,120}$/.test(memberId))fail(400,'队员 ID 不正确。');
    const error=makeupPlanError(req.body.plan);if(error)fail(400,error);
    const {status,date:makeupDate,startTime,endTime}=req.body.plan;
    const plan={status,date:makeupDate,startTime,endTime};
    const result=await transaction(async db=>{
      const actor=await actorOf(req,db);requireClass(actor,classId,true);
      // Same transaction lock as attendance edits: never attach to a stale/non-leave row.
      await lock(db,`day:${date}`);
      const source=(await db.query('select record from academic_attendance where class_id=$1 and lesson_date=$2 and session=$3',[classId,date,session])).rows[0];
      if(!source?.record.rows.some(row=>row.id===memberId && row.status==='absent'))fail(409,'这条请假记录已变化，请重新同步后核对。');
      const previous=(await db.query('select revision from academic_makeups where class_id=$1 and lesson_date=$2 and session=$3 and member_id=$4',[classId,date,session,memberId])).rows[0];
      revision(req.body.revision,previous?.revision ?? 0);
      const next=(await db.query(`insert into academic_makeups(class_id,lesson_date,session,member_id,revision,plan,updated_by) values($1,$2,$3,$4,$5,$6,$7) on conflict(class_id,lesson_date,session,member_id) do update set revision=excluded.revision,plan=excluded.plan,updated_by=excluded.updated_by,updated_at=now() returning ${makeupColumns}`,[classId,date,session,memberId,(previous?.revision ?? 0)+1,JSON.stringify(plan),actor.username])).rows[0];
      await audit(db,'makeup',`${classId}:${date}:${session}:${memberId}`,next.revision,plan,actor);return next;
    });res.json(result);
  }));
  app.post('/academic/holidays/:date',requireAuth,wrap(async(req,res)=>{
    const date=req.params.date;
    if(!validDate(date)||typeof req.body.active!=='boolean'||typeof req.body.note!=='string'||req.body.note.length>100)fail(400,'放假日期或说明不正确。');
    const result=await transaction(async db=>{
      const actor=await actorOf(req,db), access=academicAccess(actor);
      if(!access.all || !access.write)fail(403,'仅 Gary / Lisa 可修改放假安排。');
      await lock(db,`day:${date}`);
      const previous=(await db.query('select revision from academic_holidays where lesson_date=$1',[date])).rows[0];
      revision(req.body.revision,previous?.revision ?? 0);
      if(req.body.active && (await db.query('select 1 from academic_attendance where lesson_date=$1 limit 1',[date])).rowCount)fail(409,'当天已有点名记录，不能直接设为全俱乐部放假。');
      const next=(await db.query("insert into academic_holidays(lesson_date,revision,active,note,actor) values($1,$2,$3,$4,$5) on conflict(lesson_date) do update set revision=excluded.revision,active=excluded.active,note=excluded.note,actor=excluded.actor,updated_at=now() returning to_char(lesson_date,'YYYY-MM-DD') as date,revision,active,note,actor,updated_at as \"updatedAt\"",[date,(previous?.revision ?? 0)+1,req.body.active,req.body.note.trim(),actor.username])).rows[0];
      await audit(db,'holiday',date,next.revision,next,actor);return next;
    });res.json(result);
  }));
  app.post('/academic/migrate',requireAuth,wrap(async(req,res)=>{
    const {rosters={},attendance=[],holidays=[]}=req.body;
    if(!rosters || typeof rosters!=='object'||Array.isArray(rosters)||Object.keys(rosters).length>100||!Array.isArray(attendance)||attendance.length>5000||!Array.isArray(holidays)||holidays.length>2000)fail(400,'本地备份格式或大小不正确。');
    const result=await transaction(async db=>{
      const actor=await actorOf(req,db), access=academicAccess(actor);
      if(!access.all || !access.write)fail(403,'仅 Gary / Lisa 可以迁移本地历史数据。');
      const report={rosters:0,attendance:0,holidays:0,skipped:[]};
      // Same lock order as normal writes. Imports only INSERT: no remote data is replaced.
      for(const id of Object.keys(rosters).sort()) {
        requireClass(actor,id,true);const list=members(rosters[id]);await lock(db,`roster:${id}`);
        const added=await db.query('insert into academic_rosters(class_id,revision,members,updated_by) values($1,1,$2,$3) on conflict do nothing',[id,JSON.stringify(list),actor.username]);
        if(added.rowCount){report.rosters++;await audit(db,'roster',id,1,list,actor);}else report.skipped.push(`名单 ${id}`);
      }
      const dates=[...new Set([...attendance.map(e=>e?.date),...holidays.map(h=>h?.date)])].sort();
      for(const date of dates){if(!validDate(date))fail(400,'历史备份中存在无效日期。');await lock(db,`day:${date}`);}
      for(const entry of attendance) {
        requireClass(actor,entry.classId,true);
        if(!['regular','extra1','extra2'].includes(entry.session))fail(400,'历史课次不正确。');
        const record=importedRecord(entry.record,actor,entry.date);
        if((await db.query('select 1 from academic_holidays where lesson_date=$1 and active',[entry.date])).rowCount)fail(409,'历史点名与云端放假安排冲突，请先核对。');
        const added=await db.query('insert into academic_attendance(class_id,lesson_date,session,revision,record,updated_by) values($1,$2,$3,1,$4,$5) on conflict do nothing',[entry.classId,entry.date,entry.session,JSON.stringify(record),actor.username]);
        if(added.rowCount){report.attendance++;await audit(db,'attendance',`${entry.classId}:${entry.date}:${entry.session}`,1,record,actor);}else report.skipped.push(`点名 ${entry.classId} ${entry.date} ${entry.session}`);
      }
      for(const h of holidays) {
        if(typeof h.active!=='boolean'||typeof h.note!=='string'||h.note.length>100)fail(400,'历史放假安排格式不正确。');
        if(h.active && (await db.query('select 1 from academic_attendance where lesson_date=$1 limit 1',[h.date])).rowCount)fail(409,'本地放假安排与已有点名冲突，请先核对。');
        const added=await db.query('insert into academic_holidays(lesson_date,revision,active,note,actor) values($1,1,$2,$3,$4) on conflict do nothing',[h.date,h.active,h.note,actor.username]);
        if(added.rowCount){report.holidays++;await audit(db,'holiday',h.date,1,h,actor);}else report.skipped.push(`放假 ${h.date}`);
      }
      return report;
    });res.json(result);
  }));
}
