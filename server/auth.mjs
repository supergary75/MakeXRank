import crypto from 'node:crypto';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {canManageStaff} from './staff-access.mjs';

const scrypt=promisify(crypto.scrypt);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const profileColumns='auth_user_id,username,display_name,role,is_active,allowed_event_types,allowed_competition_ids,created_at';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const wrap=fn=>async(req,res,next)=>{try{res.set('Cache-Control','no-store');await fn(req,res);}catch(e){next(e);}};

export async function mountAuth(app,pool,secret,{now=Date.now}={}) {
  if(!secret)throw new Error('JWT_SECRET is required');
  await pool.query(await readFile(new URL('./auth.sql',import.meta.url),'utf8'));
  let activeKdf=0,nextCleanup=0;
  async function kdf(password,salt) {
    if(activeKdf>=2)fail(429,'Login service busy; retry shortly');
    activeKdf++;
    try{return await scrypt(password,salt,64);}finally{activeKdf--;}
  }
  async function hashPassword(password) {
    const salt=crypto.randomBytes(16).toString('hex');
    return `${salt}:${(await kdf(password,salt)).toString('hex')}`;
  }
  async function checkPassword(password,stored) {
    if(typeof stored!=='string'||!/^[0-9a-f]{32}:[0-9a-f]{128}$/i.test(stored))return false;
    const [salt,hash]=stored.split(':');
    return crypto.timingSafeEqual(Buffer.from(hash,'hex'),await kdf(password,salt));
  }
  function sign(sub,sid) {
    const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const body=Buffer.from(JSON.stringify({sub,sid,exp:Math.floor(now()/1000)+3600})).toString('base64url');
    const data=`${head}.${body}`;
    return `${data}.${crypto.createHmac('sha256',secret).update(data).digest('base64url')}`;
  }
  function decode(req,expired=false) {
    try {
      const value=req.get('authorization')||'';
      if(!value.startsWith('Bearer ')||value.length>2048)return null;
      const parts=value.slice(7).split('.');if(parts.length!==3)return null;
      const [h,p,s]=parts;
      const header=JSON.parse(Buffer.from(h,'base64url').toString());
      if(header.alg!=='HS256')return null;
      const expected=crypto.createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url');
      if(s.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(expected)))return null;
      const body=JSON.parse(Buffer.from(p,'base64url').toString());
      if(!uuid.test(body.sub)||!uuid.test(body.sid)||!Number.isSafeInteger(body.exp)||(!expired&&body.exp<=now()/1000))return null;
      return body;
    }catch{return null;}
  }
  const profile=async id=>(await pool.query(`select ${profileColumns} from user_profiles where auth_user_id=$1`,[id])).rows[0];
  async function auth(req) {
    const user=decode(req);if(!user)return null;
    const {rows}=await pool.query(`select s.id from auth_sessions s join user_profiles p on p.auth_user_id=s.auth_user_id
      where s.id=$1 and s.auth_user_id=$2 and s.revoked_at is null and s.expires_at>now() and p.is_active=true`,[user.sid,user.sub]);
    return rows[0]?user:null;
  }
  const guard=async(req,res,next)=>{try{const user=await auth(req);if(!user)fail(401,'Authentication required');req.user=user;next();}catch(e){next(e);}};
  async function userTransaction(id,fn) {
    const db=await pool.connect();
    try {
      await db.query('begin');
      await db.query("set local lock_timeout='5s'; set local statement_timeout='10s'");
      const user=(await db.query('select * from user_profiles where auth_user_id=$1 for update',[id])).rows[0];
      const result=await fn(db,user);
      await db.query('commit');return result;
    }catch(e){await db.query('rollback');throw e;}finally{db.release();}
  }
  async function issue(db,userId,sessionId) {
    const refresh=crypto.randomBytes(48).toString('base64url');
    const inserted=await db.query(`insert into refresh_tokens(token_hash,auth_user_id,expires_at,session_id)
      select $1,auth_user_id,expires_at,id from auth_sessions where id=$2 and auth_user_id=$3 and revoked_at is null and expires_at>now() returning token_hash`,[digest(refresh),sessionId,userId]);
    if(!inserted.rows.length)fail(401,'Authentication required');
    return {access_token:sign(userId,sessionId),refresh_token:refresh,expires_in:3600,user:{id:userId}};
  }
  async function budget(kind,value,limit) {
    const key=`${kind}:${crypto.createHmac('sha256',secret).update(value).digest('hex')}`;
    const at=new Date(now());const until=new Date(now()+15*60*1000);
    const {rows}=await pool.query(`insert into auth_attempts(key,attempts,expires_at) values($1,1,$3)
      on conflict(key) do update set attempts=case when auth_attempts.expires_at<=$2 then 1 else auth_attempts.attempts+1 end,
      expires_at=case when auth_attempts.expires_at<=$2 then $3 else auth_attempts.expires_at end returning attempts`,[key,at,until]);
    if(rows[0].attempts>limit)fail(429,'Too many login attempts; retry in 15 minutes');
    if(now()>=nextCleanup){nextCleanup=now()+60000;await pool.query('delete from auth_attempts where expires_at<$1',[at]);}
  }
  app.post('/auth/v1/token',wrap(async(req,res)=>{
    // Only trust the loopback proxy configured by createCoreApi, never an arbitrary header.
    await budget('ip',req.ip||req.socket.remoteAddress||'unknown',120);
    if(req.query.grant_type==='refresh_token'){
      const token=req.body?.refresh_token;
      if(typeof token!=='string'||token.length>256||!token)fail(401,'Invalid refresh token');
      const hash=digest(token);
      const entry=(await pool.query('select auth_user_id,session_id from refresh_tokens where token_hash=$1',[hash])).rows[0];
      if(!entry?.session_id)fail(401,'Invalid refresh token');
      return res.json(await userTransaction(entry.auth_user_id,async(db,user)=>{
        if(!user?.is_active)fail(401,'Invalid refresh token');
        const session=(await db.query('select id from auth_sessions where id=$1 and auth_user_id=$2 and revoked_at is null and expires_at>now()',[entry.session_id,user.auth_user_id])).rows[0];
        if(!session)fail(401,'Invalid refresh token');
        const consumed=await db.query('delete from refresh_tokens where token_hash=$1 and session_id=$2 and expires_at>now() returning token_hash',[hash,entry.session_id]);
        if(!consumed.rows.length)fail(401,'Invalid refresh token');
        return issue(db,user.auth_user_id,entry.session_id);
      }));
    }
    if(req.query.grant_type&&req.query.grant_type!=='password')fail(400,'Unsupported grant type');
    const email=req.body?.email,password=req.body?.password;
    if(typeof email!=='string'||email.length>254||!email||typeof password!=='string'||!password||password.length>128)fail(400,'Invalid login credentials');
    const username=email.split('@')[0].toLowerCase();
    await budget('account',username,10);
    const user=(await pool.query('select * from user_profiles where username=$1',[username])).rows[0];
    if(!user?.is_active||!await checkPassword(password,user.password_hash))fail(400,'Invalid login credentials');
    return res.json(await userTransaction(user.auth_user_id,async(db,current)=>{
      // Password verification is outside the lock: re-check its exact generation under it.
      if(!current?.is_active||current.password_hash!==user.password_hash)fail(400,'Invalid login credentials');
      const sid=crypto.randomUUID();
      await db.query('insert into auth_sessions(id,auth_user_id) values($1,$2)',[sid,user.auth_user_id]);
      return issue(db,user.auth_user_id,sid);
    }));
  }));
  app.get('/auth/v1/user',guard,(req,res)=>res.json({id:req.user.sub}));
  app.post('/auth/v1/logout',wrap(async(req,res)=>{
    // A valid signature may revoke its own session even after access expiry; no new access is granted.
    const user=decode(req,true);
    if(user)await userTransaction(user.sub,async db=>{
      await db.query('update auth_sessions set revoked_at=now() where id=$1 and auth_user_id=$2',[user.sid,user.sub]);
      await db.query('delete from refresh_tokens where session_id=$1 and auth_user_id=$2',[user.sid,user.sub]);
    });
    res.status(204).end();
  }));
  app.post('/functions/v1/manage-users',wrap(async(req,res)=>{
    const action=req.body?.action;
    if(!['bootstrap_admin','create_user','delete_user','reset_password'].includes(action))fail(400,'Unknown action');
    const caller=await auth(req);
    if(action!=='bootstrap_admin'&&!canManageStaff(caller&&await profile(caller.sub)))fail(403,'Only supergary can manage staff');
    if(action==='bootstrap_admin'){
      await budget('bootstrap-ip',req.ip||req.socket.remoteAddress||'unknown',10);
      if((await pool.query('select count(*)::int n from user_profiles')).rows[0].n>0)fail(409,'Admin account already exists');
    }
    if(action==='delete_user'){
      if(!uuid.test(req.body.authUserId))fail(400,'Invalid user ID');
      if(req.body.authUserId.toLowerCase()===caller?.sub.toLowerCase())fail(400,'Cannot delete your own account');
      await userTransaction(req.body.authUserId,db=>db.query('delete from user_profiles where auth_user_id=$1',[req.body.authUserId]));return res.json({success:true});
    }
    if(typeof req.body.password!=='string'||req.body.password.length<8||req.body.password.length>128)fail(400,'Password must be 8-128 characters');
    const passwordHash=await hashPassword(req.body.password);
    if(action==='reset_password'){
      if(!uuid.test(req.body.authUserId))fail(400,'Invalid user ID');
      await userTransaction(req.body.authUserId,async(db,user)=>{
        if(!user)fail(404,'User not found');
        await db.query('update user_profiles set password_hash=$1 where auth_user_id=$2',[passwordHash,user.auth_user_id]);
        await db.query('update auth_sessions set revoked_at=now() where auth_user_id=$1',[user.auth_user_id]);
        await db.query('delete from refresh_tokens where auth_user_id=$1',[user.auth_user_id]);
      });return res.json({success:true});
    }
    if(!['admin','editor','viewer'].includes(req.body.role)||!String(req.body.displayName||'').trim()||!String(req.body.username||'').trim())fail(400,'Invalid user profile');
    for(const key of ['allowedEventTypes','allowedCompetitionIds'])if(req.body[key]!=null&&(!Array.isArray(req.body[key])||req.body[key].some(x=>typeof x!=='string')))fail(400,'Invalid permission scope');
    const db=await pool.connect();
    try{
      await db.query('begin');
      if(action==='bootstrap_admin'){
        await db.query('lock table user_profiles in exclusive mode');
        if((await db.query('select count(*)::int n from user_profiles')).rows[0].n>0)fail(409,'Admin account already exists');
        if(String(req.body.username).trim().toLowerCase()!=='supergary')fail(400,'Initial administrator username must be supergary');
      }
      const {rows}=await db.query(`insert into user_profiles(auth_user_id,username,display_name,password_hash,role,allowed_event_types,allowed_competition_ids) values($1,$2,$3,$4,$5,$6,$7) returning ${profileColumns}`,[crypto.randomUUID(),String(req.body.username).trim().toLowerCase(),req.body.displayName,passwordHash,action==='bootstrap_admin'?'admin':req.body.role,req.body.allowedEventTypes||null,req.body.allowedCompetitionIds||null]);
      await db.query('commit');res.json({profile:rows[0],success:true});
    }catch(e){await db.query('rollback');throw e;}finally{db.release();}
  }));
  // Keep one durable validator for requireAuth, generic REST, and management callers.
  return {auth,requireAuth:guard,profile};
}
