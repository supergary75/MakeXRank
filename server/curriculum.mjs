import {readFile} from 'node:fs/promises';
import {monthlyCurriculum} from '../shared/monthlyCurriculum.mjs';
import {curriculumLevels,curriculumPermissions,curriculumFail,transitionMonth} from '../shared/curriculumWorkflow.mjs';

export async function mountCurriculumRoutes(app,pool,requireAuth) {
  await pool.query(await readFile(new URL('./curriculum.sql',import.meta.url),'utf8'));
  const wrap=fn=>async(req,res,next)=>{try{res.set('Cache-Control','no-store');await fn(req,res);}catch(e){if(e.status)res.status(e.status).json({message:e.message});else next(e);}};
  const levelOf=req=>{const level=req.params.level;if(!curriculumLevels.includes(level))curriculumFail(404,'课程级别不存在');return level;};
  const actorOf=async(req,db=pool)=>{
    const {rows}=await db.query('select auth_user_id,username,role,is_active from user_profiles where auth_user_id=$1',[req.user.sub]);
    if(!rows[0]?.is_active)curriculumFail(401,'请重新登录');return rows[0];
  };
  app.get('/curriculum/:level',wrap(async(req,res)=>{
    const level=levelOf(req);
    const {rows}=await pool.query('select month,published from curriculum_months where level=$1 order by month',[level]);
    res.json({months:monthlyCurriculum[level].map((baseline,i)=>rows.find(row=>row.month===i+1)?.published||baseline)});
  }));
  app.get('/curriculum/:level/workspace',requireAuth,wrap(async(req,res)=>{
    const level=levelOf(req),actor=await actorOf(req),permissions=curriculumPermissions(actor,level);
    if(!permissions.edit)return res.json({permissions,months:[]});
    const {rows}=await pool.query('select month,revision,published,draft,state,note,updated_at from curriculum_months where level=$1 order by month',[level]);
    res.json({permissions,months:monthlyCurriculum[level].map((baseline,i)=>rows.find(row=>row.month===i+1)||{month:i+1,revision:0,published:baseline,draft:null,state:'published',note:null})});
  }));
  app.get('/curriculum/:level/:month/history',requireAuth,wrap(async(req,res)=>{
    const level=levelOf(req),actor=await actorOf(req),month=Number(req.params.month);
    if(!curriculumPermissions(actor,level).edit)curriculumFail(403,'无权查看这个级别的编辑记录');
    if(!Number.isInteger(month)||month<1||month>12)curriculumFail(400,'月份错误');
    const {rows}=await pool.query('select revision,action,published,draft,actor,created_at from curriculum_month_versions where level=$1 and month=$2 order by revision desc limit 100',[level,month]);
    res.json(rows);
  }));
  app.post('/curriculum/:level/:month',requireAuth,wrap(async(req,res)=>{
    const level=levelOf(req),month=Number(req.params.month);
    if(!Number.isInteger(month)||month<1||month>12)curriculumFail(400,'月份错误');
    const client=await pool.connect();
    try {
      await client.query('begin');
      await client.query("set local statement_timeout='5s'");
      const actor=await actorOf(req,client);
      if(!curriculumPermissions(actor,level).edit)curriculumFail(403,'你没有这个级别的课程编辑权限');
      await client.query('insert into curriculum_months(level,month,published) values($1,$2,$3) on conflict(level,month) do nothing',[level,month,JSON.stringify(monthlyCurriculum[level][month-1])]);
      const row=(await client.query('select * from curriculum_months where level=$1 and month=$2 for update',[level,month])).rows[0];
      const input={...req.body,restoredContent:undefined};
      if(input.action==='restore'){
        if(!curriculumPermissions(actor,level).publish)curriculumFail(403,'仅 Gary 可以恢复历史版本');
        if(!Number.isInteger(input.version))curriculumFail(400,'历史版本错误');
        const historic=(await client.query("select published from curriculum_month_versions where level=$1 and month=$2 and revision=$3 and action in ('initial','publish','restore')",[level,month,input.version])).rows[0];
        if(!historic)curriculumFail(404,'可恢复的发布版本不存在');input.restoredContent=historic.published;
      }
      const changed=transitionMonth(row,input,actor,level);
      await client.query("insert into curriculum_month_versions(level,month,revision,action,published,actor) values($1,$2,0,'initial',$3,'初始课程大纲') on conflict do nothing",[level,month,JSON.stringify(monthlyCurriculum[level][month-1])]);
      const saved=(await client.query('update curriculum_months set revision=$3,published=$4,draft=$5,state=$6,note=$7,updated_by=$8,updated_at=now() where level=$1 and month=$2 returning month,revision,published,draft,state,note,updated_at',[level,month,changed.revision,JSON.stringify(changed.published),changed.draft?JSON.stringify(changed.draft):null,changed.state,changed.note,actor.auth_user_id])).rows[0];
      await client.query('insert into curriculum_month_versions(level,month,revision,action,published,draft,actor) values($1,$2,$3,$4,$5,$6,$7)',[level,month,changed.revision,input.action,JSON.stringify(changed.published),changed.draft?JSON.stringify(changed.draft):null,actor.username]);
      await client.query('commit');res.json(saved);
    }catch(e){await client.query('rollback');throw e;}finally{client.release();}
  }));
}
