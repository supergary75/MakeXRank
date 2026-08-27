import crypto from 'node:crypto';
import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
if (!databaseUrl || !jwtSecret) throw new Error('DATABASE_URL and JWT_SECRET are required');
const pool = new Pool({ connectionString: databaseUrl, max: 10 });
app.disable('x-powered-by');
app.use(express.json({ limit: '30mb' }));

const tables = {
  competitions: ['id','event_type','name','created_at','updated_at','last_update','source_text','teams_data'],
  practice_sync: ['id','events','deleted_event_ids','updated_at'],
  training_sync: ['id','events','schedules','updated_at'],
  team_tag_sync: ['id','tags','options','updated_at'],
  logistics_sync: ['id','events','deleted_event_ids','updated_at'],
  inspire_sync: ['id','payload','updated_at'],
  user_profiles: ['auth_user_id','username','display_name','role','is_active','allowed_event_types','allowed_competition_ids','created_at'],
};
const b64 = (v) => Buffer.from(v).toString('base64url');
function sign(payload, ttl = 3600) {
  const body = { ...payload, exp: Math.floor(Date.now()/1000)+ttl };
  const head = b64(JSON.stringify({ alg:'HS256',typ:'JWT' }));
  const data = `${head}.${b64(JSON.stringify(body))}`;
  return `${data}.${crypto.createHmac('sha256',jwtSecret).update(data).digest('base64url')}`;
}
function verify(token) {
  try {
    const [h,p,s] = token.split('.'); const data = `${h}.${p}`;
    const expected = crypto.createHmac('sha256',jwtSecret).update(data).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(expected))) return null;
    const body = JSON.parse(Buffer.from(p,'base64url')); return body.exp > Date.now()/1000 ? body : null;
  } catch { return null; }
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`;
}
function checkPassword(password, stored) {
  const [salt,hash] = stored.split(':');
  return crypto.timingSafeEqual(Buffer.from(hash,'hex'),crypto.scryptSync(password,salt,64));
}
function auth(req) {
  const value = req.get('authorization') || '';
  return value.startsWith('Bearer ') ? verify(value.slice(7)) : null;
}
const requireAuth = (req,res,next) => { const user=auth(req); if(!user)return res.status(401).json({message:'Authentication required'}); req.user=user; next(); };
async function profile(id) {
  const {rows}=await pool.query('select auth_user_id,username,display_name,role,is_active,allowed_event_types,allowed_competition_ids,created_at from user_profiles where auth_user_id=$1',[id]); return rows[0];
}
async function issue(userId) {
  const refresh=crypto.randomBytes(48).toString('base64url');
  await pool.query('insert into refresh_tokens(token_hash,auth_user_id,expires_at) values($1,$2,now()+interval \'30 days\')',[crypto.createHash('sha256').update(refresh).digest('hex'),userId]);
  return {access_token:sign({sub:userId}),refresh_token:refresh,expires_in:3600,user:{id:userId}};
}
app.get('/health', async (_req,res) => { await pool.query('select 1'); res.json({ok:true}); });
app.post('/auth/v1/token', async (req,res,next) => { try {
  if(req.query.grant_type==='refresh_token'){
    const hash=crypto.createHash('sha256').update(req.body.refresh_token||'').digest('hex');
    const {rows}=await pool.query('delete from refresh_tokens where token_hash=$1 and expires_at>now() returning auth_user_id',[hash]);
    if(!rows[0])return res.status(401).json({message:'Invalid refresh token'}); return res.json(await issue(rows[0].auth_user_id));
  }
  const username=String(req.body.email||'').split('@')[0].toLowerCase();
  const {rows}=await pool.query('select * from user_profiles where username=$1',[username]); const user=rows[0];
  if(!user||!user.is_active||!checkPassword(String(req.body.password||''),user.password_hash))return res.status(400).json({message:'Invalid login credentials'});
  res.json(await issue(user.auth_user_id));
} catch(e){next(e);} });
app.get('/auth/v1/user',requireAuth,(req,res)=>res.json({id:req.user.sub}));
app.post('/auth/v1/logout',requireAuth,(_req,res)=>res.status(204).end());

app.post('/functions/v1/manage-users', async (req,res,next) => { try {
  const action=req.body.action; const caller=auth(req); const count=(await pool.query('select count(*)::int n from user_profiles')).rows[0].n;
  if(action!=='bootstrap_admin'){
    const me=caller&&await profile(caller.sub); if(!me||me.role!=='admin'||!me.is_active)return res.status(403).json({message:'Only an active admin can create users'});
  } else if(count>0) return res.status(409).json({message:'Admin account already exists'});
  if(action==='delete_user'){await pool.query('delete from user_profiles where auth_user_id=$1',[req.body.authUserId]);return res.json({success:true});}
  if(action==='reset_password'){await pool.query('update user_profiles set password_hash=$1 where auth_user_id=$2',[hashPassword(req.body.password),req.body.authUserId]);return res.json({success:true});}
  const id=crypto.randomUUID(); const role=action==='bootstrap_admin'?'admin':req.body.role;
  const {rows}=await pool.query(`insert into user_profiles(auth_user_id,username,display_name,password_hash,role,allowed_event_types,allowed_competition_ids) values($1,$2,$3,$4,$5,$6,$7) returning auth_user_id,username,display_name,role,is_active,allowed_event_types,allowed_competition_ids,created_at`,[id,String(req.body.username).trim().toLowerCase(),req.body.displayName,hashPassword(req.body.password),role,req.body.allowedEventTypes||null,req.body.allowedCompetitionIds||null]);
  res.json({profile:rows[0],success:true});
} catch(e){next(e);} });

app.all('/rest/v1/:table', async (req,res,next) => { try {
  const cols=tables[req.params.table]; if(!cols)return res.status(404).json({message:'Unknown table'});
  const publicRead=['competitions','team_tag_sync'].includes(req.params.table);
  const user=auth(req); if(req.method==='GET'&&!publicRead&&!user)return res.status(401).json({message:'Authentication required'});
  if(req.method!=='GET'&&!user)return res.status(401).json({message:'Authentication required'});
  const table=req.params.table;
  if(req.method==='GET'){
    const selected=String(req.query.select||'*').split(',').filter(c=>c==='*'||cols.includes(c));
    const values=[]; const where=[];
    for(const c of cols){const q=req.query[c];if(typeof q==='string'&&q.startsWith('eq.')){values.push(q.slice(3));where.push(`${c}=$${values.length}`);}}
    let sql=`select ${selected.includes('*')?'*':selected.join(',')} from ${table}`; if(where.length)sql+=` where ${where.join(' and ')}`;
    if(typeof req.query.order==='string'){const [c,d]=req.query.order.split('.');if(cols.includes(c))sql+=` order by ${c} ${d==='desc'?'desc':'asc'}`;}
    if(req.query.limit)sql+=` limit ${Math.max(1,Math.min(10000,Number(req.query.limit)||1000))}`;
    return res.json((await pool.query(sql,values)).rows);
  }
  if(req.method==='POST'){
    const items=Array.isArray(req.body)?req.body:[req.body]; const output=[];
    for(const item of items){const keys=Object.keys(item).filter(k=>cols.includes(k));if(cols.includes('updated_at')&&!keys.includes('updated_at')){item.updated_at=new Date();keys.push('updated_at');}
      const vals=keys.map(k=>item[k]); const updates=keys.filter(k=>k!=='id'&&k!=='auth_user_id').map(k=>`${k}=excluded.${k}`);
      const conflict=cols.includes('id')?'id':'auth_user_id'; const q=`insert into ${table}(${keys.join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')}) on conflict(${conflict}) do update set ${updates.join(',')} returning *`; output.push((await pool.query(q,vals)).rows[0]);}
    return res.status(201).json(output);
  }
  const idCol=cols.includes('id')?'id':'auth_user_id'; const raw=req.query[idCol]; if(typeof raw!=='string'||!raw.startsWith('eq.'))return res.status(400).json({message:'ID filter required'});
  if(req.method==='PATCH'){const keys=Object.keys(req.body).filter(k=>cols.includes(k)&&k!==idCol);const vals=keys.map(k=>req.body[k]);await pool.query(`update ${table} set ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} where ${idCol}=$${keys.length+1}`,[...vals,raw.slice(3)]);return res.status(204).end();}
  if(req.method==='DELETE'){await pool.query(`delete from ${table} where ${idCol}=$1`,[raw.slice(3)]);return res.status(204).end();}
  res.status(405).end();
} catch(e){next(e);} });
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({message:'Server error'});});
app.listen(port,'127.0.0.1',()=>console.log(`MakeXRank API listening on ${port}`));
