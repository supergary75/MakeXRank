import {readFile} from 'node:fs/promises';
import {canManageStaff} from './staff-access.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const wrap=fn=>async(req,res,next)=>{try{res.set('Cache-Control','no-store');await fn(req,res);}catch(error){next(error);}};
const validId=value=>typeof value==='string'&&/^[1-9][0-9]{0,17}$/.test(value);
function day(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail(400,'Invalid activity date');
  const utc=Date.parse(`${value}T00:00:00Z`);
  if(!Number.isFinite(utc)||new Date(utc).toISOString().slice(0,10)!==value)fail(400,'Invalid activity date');
  return utc-8*3600000;
}
export async function mountAccessActivity(app,pool,{auth,profile}) {
  await pool.query(await readFile(new URL('./access-activity.sql',import.meta.url),'utf8'));
  async function owner(req) {
    const user=await auth(req);if(!user)fail(401,'Authentication required');
    if(!canManageStaff(await profile(user.sub)))fail(403,'Only supergary can view login activity');
  }
  // Closing a page is not logout. Only the exact session deadline is recorded here.
  const expire=()=>pool.query("update auth_access_history set ended_at=expires_at,end_reason='expired' where ended_at is null and expires_at<=now()");
  app.get('/auth/v1/access-log',wrap(async(req,res)=>{
    await owner(req);
    const from=day(req.query.from),until=day(req.query.to)+86400000;
    if(until<=from||until-from>93*86400000)fail(400,'Choose an activity range of 1-93 days');
    const username=req.query.username,before=req.query.before;
    if(username!==undefined&&(typeof username!=='string'||username.length>128))fail(400,'Invalid activity username');
    if(before!==undefined&&!validId(before))fail(400,'Invalid activity cursor');
    await expire();
    const values=[new Date(from),new Date(until)],where=['logged_in_at >= $1','logged_in_at < $2'];
    if(username){values.push(username);where.push(`username=$${values.length}`);}
    const total=(await pool.query(`select count(*)::int total from auth_access_history where ${where.join(' and ')}`,values)).rows[0].total;
    if(before){values.push(before);where.push(`id<$${values.length}::bigint`);}
    const rows=(await pool.query(`select id::text,username,display_name as "displayName",logged_in_at as "loggedInAt",expires_at as "expiresAt",ended_at as "endedAt",end_reason as "endReason",password_setup as "passwordSetup",legacy from auth_access_history where ${where.join(' and ')} order by auth_access_history.id desc limit 51`,values)).rows;
    const tracking=(await pool.query('select started_at from auth_access_tracking where singleton=true')).rows[0].started_at;
    res.json({rows:rows.slice(0,50),total,nextBefore:rows.length>50?rows[49].id:null,trackingStartedAt:tracking});
  }));
  app.get('/auth/v1/access-events',wrap(async(req,res)=>{
    await owner(req);await expire();
    const {rows}=await pool.query(`select e.id::text,h.username,h.display_name as "displayName",e.event_type as type,e.occurred_at as at
      from auth_access_events e join auth_access_history h on h.id=e.history_id where e.notified_at is null order by e.id desc limit 20`);
    const meta=(await pool.query('select (select count(*)::int from auth_access_events where notified_at is null) as "unreadCount",(select coalesce(max(id),0)::text from auth_access_events) as "latestId"')).rows[0];
    res.json({events:rows,...meta});
  }));
  app.post('/auth/v1/access-events/seen',wrap(async(req,res)=>{
    await owner(req);
    if(!validId(req.body?.through))fail(400,'Invalid activity receipt');
    // A receipt touches only committed visible rows. Late-committing transactions stay unread.
    await pool.query('update auth_access_events set notified_at=now() where id<=$1::bigint and notified_at is null',[req.body.through]);
    res.json({success:true});
  }));
}
