// Fixture-only HTTP tests against the real core API; never connects to production.
import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import pgUtils from 'pg/lib/utils.js';
import {createCoreApi,apiError} from './api.mjs';

let db,server,url,tail=Promise.resolve(),hook;
const secret='isolated-fixture-signing-secret',password='FixturePassword123!';
const users=Object.fromEntries(['admin','editor','viewer','scoped','disabled'].map((key,i)=>[key,`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
users.admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const salt='0123456789abcdef0123456789abcdef';
const hash=`${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`;
let now=Date.now();
const direct=async(sql,params)=>{
  let result;
  // Match node-postgres wire encoding: JS arrays become PostgreSQL arrays,
  // not JSON. Without this, PGlite can hide production JSONB binding bugs.
  const wireParams=params?.map(value=>pgUtils.prepareValue(value));
  if(!params&&sql.includes(';'))result=(await db.exec(sql)).at(-1);else result=await db.query(sql,wireParams);
  return {...result,rowCount:result.rows?.length||result.affectedRows||0};
};
async function connect(){
  let unlock;const previous=tail;tail=new Promise(resolve=>{unlock=resolve;});await previous;
  return {query:direct,release:unlock};
}
const pool={connect,query:async(sql,params)=>{
  const client=await connect();let result;
  try{result=await client.query(sql,params);}finally{client.release();}
  if(hook)await hook(sql,result);return result;
}};
before(async()=>{
  db=await PGlite.create();await db.exec(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
  const {app,requireAuth}=await createCoreApi(pool,secret,{now:()=>now});
  app.get('/fixture-private',requireAuth,(req,res)=>res.json({id:req.user.sub}));app.use(apiError);
  server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});url=`http://127.0.0.1:${server.address().port}`;
},{timeout:30000});
beforeEach(async()=>{
  hook=null;now=Date.now();
  await db.exec('truncate user_profiles,refresh_tokens,auth_sessions,auth_attempts,competitions,competition_deletions,practice_sync,training_sync,team_tag_sync,logistics_sync,inspire_sync cascade');
  for(const [key,id] of Object.entries(users))await db.query(`insert into user_profiles(auth_user_id,username,display_name,password_hash,role,is_active,allowed_event_types,allowed_competition_ids) values($1,$2,$2,$3,$4,$5,$6,$7)`,[id,key==='admin'?'supergary':key,hash,key==='scoped'?'editor':key==='disabled'?'editor':key,key!=='disabled',key==='scoped'?['FRC']:null,key==='scoped'?['allowed']:null]);
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.close();});
async function request(path,{method='GET',token,body,headers={}}={}){
  const response=await fetch(url+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const text=await response.text();return {status:response.status,data:text?JSON.parse(text):null};
}
const login=(user='editor',pass=password)=>request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:`${user==='admin'?'supergary':user}@makexrank.app`,password:pass}});
const refresh=token=>request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:token}});
const competition=(id='allowed',event_type='FRC')=>({id,event_type,name:'Fixture event',teams_data:[]});
test('existing salted hashes log in; anonymous public reads remain; private and legacy JWTs fail',async()=>{
  const signed=await login();assert.equal(signed.status,200);assert.equal((await request('/fixture-private',{token:signed.data.access_token})).status,200);
  assert.equal((await request('/rest/v1/competitions?select=id')).status,200);assert.equal((await request('/rest/v1/team_tag_sync')).status,200);
  assert.equal((await request('/rest/v1/competitions',{token:'makexrank-local-api'})).status,200);
  assert.equal((await request('/rest/v1/team_tag_sync',{token:'makexrank-local-api'})).status,200);
  assert.equal((await request('/rest/v1/logistics_sync')).status,401);assert.equal((await login('disabled')).status,400);
  const h=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),p=Buffer.from(JSON.stringify({sub:users.editor,exp:Math.floor(now/1000)+3600})).toString('base64url');
  const legacy=`${h}.${p}.${crypto.createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;
  assert.equal((await request('/fixture-private',{token:legacy})).status,401);
});
test('all six operational tables reject viewer writes and retain legitimate editor snapshot shapes',async()=>{
  const viewer=(await login('viewer')).data.access_token,editor=(await login()).data.access_token;
  const rows={competitions:competition(),practice_sync:{id:'inspire-shared-state',events:{students:[],tasks:[]}},training_sync:{id:'global',events:[],schedules:{}},team_tag_sync:{id:'global',tags:{},options:[]},logistics_sync:{id:'global',events:[],deleted_event_ids:[]},inspire_sync:{id:'inspire-shared-state',payload:{students:[],tasks:[]}}};
  for(const [table,row] of Object.entries(rows)){
    for(const method of ['POST','PATCH','DELETE'])assert.equal((await request(`/rest/v1/${table}?id=eq.${row.id}`,{method,token:viewer,...(method!=='DELETE'?{body:row}:{})})).status,403,`${table}/${method}`);
    assert.equal((await request(`/rest/v1/${table}`,{method:'POST',token:editor,body:row})).status,201,table);
    if(table!=='competitions')assert.equal((await request(`/rest/v1/${table}?id=eq.${row.id}`,{method:'DELETE',token:editor})).status,204);
  }
  assert.equal((await request('/rest/v1/competitions?id=eq.allowed',{method:'DELETE',token:editor})).status,403);
  assert.equal((await db.query('select * from competition_deletions')).rows.length,0);
});
test('JSONB snapshots round-trip nonempty arrays and objects with production pg bindings',async()=>{
  const token=(await login()).data.access_token;
  const rows={
    competitions:{...competition('json-roundtrip'),teams_data:[{team:'Fixture',scores:[3,5]}]},
    practice_sync:{id:'json-roundtrip',events:[{id:'practice',teams:['A','B']}],deleted_event_ids:['old-practice']},
    training_sync:{id:'json-roundtrip',events:[{id:'training',calendarDates:['2026-10-24']}],schedules:{training:{coaches:['Gary'],venues:['206-2','206大厅']}}},
    team_tag_sync:{id:'json-roundtrip',tags:{team:['ready']},options:['ready','review']},
    logistics_sync:{id:'json-roundtrip',events:[{id:'logistics',groups:['EXP']}],deleted_event_ids:['old-logistics']},
    inspire_sync:{id:'json-roundtrip',payload:{students:[{id:'synthetic'}],tasks:['practice']}},
  };
  for(const [table,row] of Object.entries(rows)){
    const saved=await request(`/rest/v1/${table}`,{method:'POST',token,body:row});
    assert.equal(saved.status,201,`${table} POST`);
    const loaded=await request(`/rest/v1/${table}?id=eq.${row.id}`,{token});
    assert.equal(loaded.status,200);
    for(const [key,value] of Object.entries(row))assert.deepEqual(loaded.data[0][key],value,`${table}.${key}`);
    const patch=Object.fromEntries(Object.entries(row).filter(([,v])=>Array.isArray(v)).map(([k])=>[k,[{id:'updated',values:[1,2]}]]));
    if(Object.keys(patch).length){
      assert.equal((await request(`/rest/v1/${table}?id=eq.${row.id}`,{method:'PATCH',token,body:patch})).status,204);
      const updated=await request(`/rest/v1/${table}?id=eq.${row.id}`,{token});
      for(const [key,value] of Object.entries(patch))assert.deepEqual(updated.data[0][key],value,`${table} PATCH ${key}`);
    }
  }
});

test('competition scopes validate stored and proposed types/IDs, PATCH and batches atomically',async()=>{
  const admin=(await login('admin')).data.access_token,scoped=(await login('scoped')).data.access_token;
  const save=(body,token=scoped)=>request('/rest/v1/competitions',{method:'POST',token,body});
  assert.equal((await save(competition())).status,201);
  assert.equal((await save(competition('other'))).status,403);
  assert.equal((await save(competition('allowed','MakeX Explorer'))).status,403);
  assert.equal((await request('/rest/v1/competitions?id=eq.allowed',{method:'PATCH',token:scoped,body:{name:'Good'}})).status,204);
  assert.equal((await request('/rest/v1/competitions?id=eq.allowed',{method:'PATCH',token:scoped,body:{event_type:'MakeX Explorer'}})).status,403);
  assert.equal((await save([{...competition(),name:'Must roll back'},competition('other')])).status,403);
  assert.equal((await db.query("select name from competitions where id='allowed'")).rows[0].name,'Good');
  await save(competition('allowed','MakeX Explorer'),admin);
  assert.equal((await save(competition())).status,403,'upsert cannot disguise stored outside-scope type');
  assert.equal((await request('/rest/v1/practice_sync',{method:'POST',token:scoped,body:{id:'shared-explorer-schedule-state',events:{cards:[]}}})).status,403);
  assert.equal((await request('/rest/v1/competitions?id=eq.allowed',{method:'DELETE',token:admin})).status,204);
  assert.deepEqual((await save(competition(),admin)).data,[],'tombstone prevents stale resurrection');
});
test('logout revokes access and refresh for that session, leaves another session usable',async()=>{
  const first=(await login()).data,second=(await login()).data;
  assert.equal((await request('/auth/v1/logout',{method:'POST',token:first.access_token})).status,204);
  assert.equal((await request('/fixture-private',{token:first.access_token})).status,401);
  assert.equal((await request('/rest/v1/logistics_sync',{token:first.access_token})).status,401);
  assert.equal((await refresh(first.refresh_token)).status,401);
  assert.equal((await request('/fixture-private',{token:second.access_token})).status,200);
});
test('expired access can sign out; refresh is one use; malformed signatures fail',async()=>{
  const session=(await login()).data;now+=3601000;
  assert.equal((await request('/fixture-private',{token:session.access_token})).status,401);
  assert.equal((await request('/auth/v1/logout',{method:'POST',token:session.access_token})).status,204);
  assert.equal((await refresh(session.refresh_token)).status,401);
  const next=(await login()).data;assert.equal((await refresh(next.refresh_token)).status,200);assert.equal((await refresh(next.refresh_token)).status,401);
  assert.equal((await request('/fixture-private',{token:'bad.token.signature'})).status,401);
});
test('sessions last seven fixed days; silent refresh cannot extend them; expiry rejects both credentials',async()=>{
  const signed=(await login()).data;
  const original=(await db.query('select created_at,expires_at from auth_sessions')).rows[0];
  assert.equal(new Date(original.expires_at).getTime()-new Date(original.created_at).getTime(),7*24*3600*1000);
  assert.equal(new Date(signed.session_expires_at).getTime(),new Date(original.expires_at).getTime());
  await db.query("update auth_sessions set created_at=now()-interval '6 days 23 hours',expires_at=now()+interval '1 hour'");
  const deadline=(await db.query('select expires_at from auth_sessions')).rows[0].expires_at;
  const rotated=await refresh(signed.refresh_token);assert.equal(rotated.status,200);
  assert.equal(new Date(rotated.data.session_expires_at).getTime(),new Date(deadline).getTime());
  assert.equal((await request('/fixture-private',{token:rotated.data.access_token})).status,200);
  await db.query("update auth_sessions set expires_at=now()-interval '1 second'");
  assert.equal((await request('/fixture-private',{token:rotated.data.access_token})).status,401);
  assert.equal((await refresh(rotated.data.refresh_token)).status,401);
  assert.equal((await login()).status,200,'expiry allows a fresh password sign-in');
});

test('seven-day migration caps existing longer sessions and refresh tokens without changing account permissions',async()=>{
  await login();
  const profileBefore=(await db.query('select * from user_profiles order by auth_user_id')).rows;
  await db.query("update auth_sessions set created_at=now()-interval '3 days',expires_at=now()+interval '27 days'");
  await db.query("update refresh_tokens set expires_at=now()+interval '27 days'");
  await createCoreApi(pool,secret,{now:()=>now});
  const row=(await db.query('select s.created_at,s.expires_at,r.expires_at refresh_expires_at from auth_sessions s join refresh_tokens r on r.session_id=s.id')).rows[0];
  assert.equal(new Date(row.expires_at).getTime()-new Date(row.created_at).getTime(),7*24*3600*1000);
  assert.equal(new Date(row.refresh_expires_at).getTime(),new Date(row.expires_at).getTime());
  assert.deepEqual((await db.query('select * from user_profiles order by auth_user_id')).rows,profileBefore);
});

test('password reset revokes all access/refresh, including concurrent refresh and prevalidated login',async()=>{
  const admin=(await login('admin')).data.access_token,session=(await login()).data;
  let release,reached;const gate=new Promise(resolve=>{release=resolve;});const hit=new Promise(resolve=>{reached=resolve;});
  hook=async(sql)=>{if(sql.startsWith('select auth_user_id,session_id from refresh_tokens')){hook=null;reached();await gate;}};
  const pending=refresh(session.refresh_token);await hit;
  const reset=pass=>request('/functions/v1/manage-users',{method:'POST',token:admin,body:{action:'reset_password',authUserId:users.editor,password:pass}});
  assert.equal((await reset('NewFixturePassword123!')).status,200);release();assert.equal((await pending).status,401);
  assert.equal((await request('/fixture-private',{token:session.access_token})).status,401);assert.equal((await refresh(session.refresh_token)).status,401);
  let releaseLogin,reachedLogin;const gateLogin=new Promise(resolve=>{releaseLogin=resolve;});const hitLogin=new Promise(resolve=>{reachedLogin=resolve;});
  hook=async(sql)=>{if(sql==='select * from user_profiles where username=$1'){hook=null;reachedLogin();await gateLogin;}};
  const pendingLogin=login('editor','NewFixturePassword123!');await hitLogin;
  assert.equal((await reset('FinalFixturePassword123!')).status,200);releaseLogin();assert.equal((await pendingLogin).status,400);
  assert.equal((await login('editor','FinalFixturePassword123!')).status,200);
});
test('credentials/body sizes and account budgets are bounded; cleanup permits later legitimate login',async()=>{
  assert.equal((await login('editor','x'.repeat(129))).status,400);
  assert.equal((await request('/auth/v1/token',{method:'POST',body:{email:[],password:{}}})).status,400);
  assert.equal((await login('editor','x'.repeat(5000))).status,413);
  for(let i=0;i<10;i++)assert.equal((await login('editor','wrong')).status,400);
  assert.equal((await login()).status,429);now+=15*60*1000+1;assert.equal((await login()).status,200);
});
test('staff management remains supergary-only and cannot be reached with revoked access',async()=>{
  const editor=(await login()).data.access_token,admin=(await login('admin')).data.access_token;
  assert.equal((await request('/rest/v1/user_profiles?select=username',{token:editor})).status,403);
  assert.equal((await request(`/rest/v1/user_profiles?auth_user_id=eq.${users.editor}`,{token:editor})).status,200);
  assert.equal((await request('/rest/v1/user_profiles?select=username',{token:admin})).status,200);
  await request('/auth/v1/logout',{method:'POST',token:admin});
  assert.equal((await request('/functions/v1/manage-users',{method:'POST',token:admin,body:{action:'reset_password',authUserId:users.editor,password}})).status,403);
});
test('equivalent UUID case cannot delete, disable or demote the current administrator',async()=>{
  const token=(await login('admin')).data.access_token;
  assert.equal((await request('/functions/v1/manage-users',{method:'POST',token,body:{action:'delete_user',authUserId:users.admin.toUpperCase()}})).status,400);
  for(const id of [users.admin.toUpperCase(),users.admin.replaceAll('-',''),`{${users.admin}}`]){
    assert.equal((await request(`/rest/v1/user_profiles?auth_user_id=eq.${encodeURIComponent(id)}`,{method:'PATCH',token,body:{is_active:false}})).status,400);
  }
  assert.equal((await request('/auth/v1/user',{token})).status,200);
  const row=(await db.query('select role,is_active from user_profiles where auth_user_id=$1',[users.admin])).rows[0];assert.equal(row.role,'admin');assert.equal(row.is_active,true);
});
test('malformed hashes fail closed and concurrent KDF work is bounded without blocking health',async()=>{
  await db.query('update user_profiles set password_hash=$1 where username=$2',['malformed','viewer']);
  assert.equal((await login('viewer')).status,400);
  const results=await Promise.all(Array.from({length:8},()=>login()));
  assert(results.some(r=>r.status===429));assert(results.every(r=>[200,429].includes(r.status)));
  assert.equal((await request('/health')).status,200);
});

test('initial login is a restricted ten-minute password-setup session; private data and management stay blocked',async()=>{
  await db.query('update user_profiles set must_change_password=true where auth_user_id=$1',[users.editor]);
  const signed=await login();assert.equal(signed.status,200);const tokens=signed.data;
  assert.equal(tokens.must_change_password,true);assert.equal(tokens.profile.must_change_password,true);
  assert(!JSON.stringify(tokens).includes('password_hash'));assert(!JSON.stringify(tokens).includes(hash));
  const session=(await db.query('select * from auth_sessions')).rows[0];
  assert.equal(session.password_setup,true);assert.equal(new Date(session.expires_at)-new Date(session.created_at),10*60*1000);
  assert.equal((await request('/auth/v1/user',{token:tokens.access_token})).status,200);
  for(const endpoint of ['/fixture-private','/rest/v1/logistics_sync','/rest/v1/user_profiles'])assert.equal((await request(endpoint,{token:tokens.access_token})).status,401);
  assert.equal((await request('/functions/v1/manage-users',{method:'POST',token:tokens.access_token,body:{action:'create_user',username:'blocked',displayName:'Blocked',role:'admin',password}})).status,403);
  const refreshed=await refresh(tokens.refresh_token);assert.equal(refreshed.status,200);assert.equal(refreshed.data.must_change_password,true);
  assert.equal(refreshed.data.session_expires_at,tokens.session_expires_at);
  await db.query("update auth_sessions set expires_at=now()-interval '1 second'");
  assert.equal((await request('/auth/v1/password-setup',{method:'POST',token:refreshed.data.access_token,body:{password:'PersonalPassphrase123!'}})).status,401);
});

test('personal password setup preserves identity/scopes, revokes all setup credentials and creates a seven-day normal session',async()=>{
  await db.query('update user_profiles set must_change_password=true where auth_user_id=$1',[users.scoped]);
  const first=(await login('scoped')).data,second=(await login('scoped')).data;
  const setup=pass=>request('/auth/v1/password-setup',{method:'POST',token:first.access_token,body:{password:pass}});
  assert.equal((await setup('short')).status,400);assert.equal((await setup(password)).status,400);
  const before=(await db.query('select auth_user_id,username,role,allowed_event_types,allowed_competition_ids from user_profiles where auth_user_id=$1',[users.scoped])).rows[0];
  const result=await setup('My personal long phrase 2026!');assert.equal(result.status,200);assert.equal(result.data.must_change_password,false);
  const after=(await db.query('select auth_user_id,username,role,allowed_event_types,allowed_competition_ids from user_profiles where auth_user_id=$1',[users.scoped])).rows[0];assert.deepEqual(after,before);
  assert.equal((await request('/fixture-private',{token:result.data.access_token})).status,200);
  assert.equal((await request('/fixture-private',{token:second.access_token})).status,401);
  assert.equal((await refresh(first.refresh_token)).status,401);assert.equal((await refresh(second.refresh_token)).status,401);
  const active=(await db.query('select created_at,expires_at from auth_sessions where revoked_at is null')).rows[0];
  assert.equal(new Date(active.expires_at)-new Date(active.created_at),7*86400000);
  assert.equal((await login('scoped',password)).status,400);
  const signed=await login('scoped','My personal long phrase 2026!');assert.equal(signed.status,200);assert.equal(signed.data.must_change_password,false);
  assert.equal((await request('/auth/v1/password-setup',{method:'POST',token:signed.data.access_token,body:{password:'Another long password 2026!'}})).status,409);
});

test('admin reset and logout defeat in-flight initial password changes',async()=>{
  const admin=(await login('admin')).data.access_token;
  await db.query('update user_profiles set must_change_password=true where auth_user_id=$1',[users.editor]);
  const signed=(await login()).data;
  let release,reached;const gate=new Promise(resolve=>{release=resolve;});const hit=new Promise(resolve=>{reached=resolve;});
  hook=async sql=>{if(sql==='select * from user_profiles where auth_user_id=$1'){hook=null;reached();await gate;}};
  const pending=request('/auth/v1/password-setup',{method:'POST',token:signed.access_token,body:{password:'User chose this long phrase!'}});await hit;
  assert.equal((await request('/functions/v1/manage-users',{method:'POST',token:admin,body:{action:'reset_password',authUserId:users.editor,password:'A different initial password!'}})).status,200);
  release();assert.equal((await pending).status,401);
  const next=(await login('editor','A different initial password!')).data;assert.equal(next.must_change_password,true);
  await request('/auth/v1/logout',{method:'POST',token:next.access_token});
  assert.equal((await request('/auth/v1/password-setup',{method:'POST',token:next.access_token,body:{password:'Personal phrase after logout!'}})).status,401);
});

async function fixtureOnboarding(){
  const sql=await readFile(new URL('./ops/onboard-staff.sql',import.meta.url),'utf8');
  await db.exec('begin');
  try {await db.query("select set_config('makexrank.amber_hash',$1,true)",[hash]);await db.exec(sql);await db.exec('commit');}
  catch(error){await db.exec('rollback');throw error;}
}

test('staff onboarding keeps the four existing identities, password hashes and roles, creates only Amber and is retry-safe',async()=>{
  const oldNames=['vincentc','brooky','jasonz','lisaw'],keys=['editor','viewer','scoped','disabled'];
  for(let i=0;i<4;i++)await db.query('update user_profiles set username=$1 where auth_user_id=$2',[oldNames[i],users[keys[i]]]);
  const ownerBefore=(await db.query('select * from user_profiles where auth_user_id=$1',[users.admin])).rows[0];
  const originals=(await db.query('select auth_user_id,password_hash,role,is_active,allowed_event_types,allowed_competition_ids from user_profiles order by auth_user_id')).rows;
  await fixtureOnboarding();
  assert.equal((await db.query('select count(*)::int n from user_profiles')).rows[0].n,6);
  assert.deepEqual((await db.query('select * from user_profiles where auth_user_id=$1',[users.admin])).rows[0],ownerBefore);
  for(const row of originals){const actual=(await db.query('select auth_user_id,password_hash,role,is_active,allowed_event_types,allowed_competition_ids from user_profiles where auth_user_id=$1',[row.auth_user_id])).rows[0];assert.deepEqual(actual,row);}
  const amber=(await db.query("select * from user_profiles where username='kclub-amber'")).rows[0];assert.equal(amber.role,'editor');assert.equal(amber.must_change_password,true);
  assert.equal((await login('vincentc')).status,400);assert.equal((await login('kclub-vincent')).data.must_change_password,true);
  await db.query("update user_profiles set must_change_password=false,password_hash='fixture-already-changed' where username='kclub-amber'");
  await fixtureOnboarding();assert.equal((await db.query("select password_hash from user_profiles where username='kclub-amber'")).rows[0].password_hash,'fixture-already-changed');
});

test('a conflicting staff login aborts the entire onboarding rather than merging or deleting accounts',async()=>{
  const oldNames=['vincentc','brooky','jasonz','lisaw'],keys=['editor','viewer','scoped','disabled'];
  for(let i=0;i<4;i++)await db.query('update user_profiles set username=$1 where auth_user_id=$2',[oldNames[i],users[keys[i]]]);
  await db.query("insert into user_profiles(auth_user_id,username,display_name,password_hash) values($1,'kclub-brook','Unrelated fixture',$2)",[crypto.randomUUID(),hash]);
  await assert.rejects(fixtureOnboarding(),/Target login already exists/);
  assert.equal((await db.query("select username from user_profiles where auth_user_id=$1",[users.editor])).rows[0].username,'vincentc');
  assert.equal((await db.query("select count(*)::int n from user_profiles where username='kclub-amber'")).rows[0].n,0);
});
