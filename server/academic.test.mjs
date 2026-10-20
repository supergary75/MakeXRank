// Isolated in-memory PostgreSQL + HTTP integration tests. No real students or production DB.
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { mountAcademicRoutes } from './academic.mjs';
import { attendanceRecord, importedRecord, members, validDate } from './academic-workflow.mjs';
import {academicAccess} from '../shared/classDirectory.mjs';
import {allowedClasses} from './academic-workflow.mjs';

let db,server,url;
const fixture={id:'fixture-student',name:'Fixture Student'};
const row={...fixture,status:'present',reason:'',detail:''};
const body={revision:0,phase:'submitted',rows:[row]};
const date='2026-01-03', classId='U15A-03';
const endpoint=`/academic/attendance/${classId}/${date}/regular`;
before(async()=>{
  db=await PGlite.create();
  await db.exec('create table user_profiles(auth_user_id text primary key,username text,role text,is_active boolean)');
  for(const [id,username,role,active] of [['admin','supergary','admin',true],['brook','brook','editor',true],['vincent','vincent','editor',true],['viewer','gary','viewer',true],['disabled','supergary','admin',false],['imposter','unknown','admin',true]])await db.query('insert into user_profiles values($1,$2,$3,$4)',[id,username,role,active]);
  const query=async(sql,params)=>{
    if(!params && sql.includes(';')){const results=await db.exec(sql);const last=results.at(-1);return {...last,rowCount:last.affectedRows??last.rows.length};}
    const result=await db.query(sql,params);return {...result,rowCount:result.rows.length||result.affectedRows||0};
  };
  const pool={query,connect:async()=>({query,release(){}})};
  const app=express();app.use(express.json());
  await mountAcademicRoutes(app,pool,(req,res,next)=>{const user=req.get('x-fixture-user');if(!user)return res.status(401).json({message:'Login required'});req.user={sub:user};next();});
  app.use((error,_req,res,_next)=>res.status(500).json({message:error.message}));
  server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
  url=`http://127.0.0.1:${server.address().port}`;
},{timeout:30000});
beforeEach(async()=>{await db.exec('truncate academic_rosters,academic_attendance,academic_holidays,academic_changes restart identity');});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.close();});
async function request(path,user='admin',data) {
  const response=await fetch(url+path,{method:data===undefined?'GET':'POST',headers:{...(user?{'x-fixture-user':user}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000)});
  return {status:response.status,data:await response.json()};
}
const saveRoster=(id=classId,user='admin',revision=0,list=[fixture])=>request('/academic/rosters',user,{changes:{[id]:list},revisions:{[id]:revision}});
test('requires authentication; disabled accounts and unassigned admins cannot obtain private class data',async()=>{
  assert.equal((await request('/academic/snapshot',null)).status,401);
  assert.equal((await request('/academic/snapshot','disabled')).status,401);
  const result=await request('/academic/snapshot','imposter');assert.deepEqual(result.data.classIds,[]);assert.deepEqual(result.data.rosters,[]);
});
test('teacher snapshots contain only assigned classes; server rejects cross-coach edits and viewer writes',async()=>{
  await saveRoster();await saveRoster('U12B-07');
  const result=await request('/academic/snapshot','brook');
  assert.deepEqual(result.data.rosters.map(r=>r.class_id),['U12B-07']);assert(!result.data.classIds.includes(classId));
  assert.equal((await saveRoster(classId,'brook')).status,403);
  assert.equal((await saveRoster(classId,'viewer')).status,403);
});
test('new staff login names preserve existing teaching scopes; Amber has no unassigned class access',()=>{
  for(const [oldName,newName] of [['brooky','kclub-brook'],['vincentc','kclub-vincent'],['jasonz','kclub-jason'],['lisaw','kclub-lisa']]){
    const old={username:oldName,role:'editor',is_active:true},next={...old,username:newName};
    assert.deepEqual(academicAccess(next),academicAccess(old));assert.deepEqual(allowedClasses(next),allowedClasses(old));
  }
  const amber={username:'kclub-amber',role:'editor',is_active:true};
  assert.deepEqual(academicAccess(amber),{all:false,coach:'A',write:true});assert.deepEqual(allowedClasses(amber),[]);
});
test('stale roster revision cannot overwrite another device; batch save rolls back atomically',async()=>{
  assert.equal((await saveRoster()).status,200);
  assert.equal((await saveRoster(classId,'admin',0,[])).status,409);
  const batch=await request('/academic/rosters','admin',{changes:{'U12A-04':[fixture],[classId]:[]},revisions:{'U12A-04':0,[classId]:0}});
  assert.equal(batch.status,409);
  const snapshot=(await request('/academic/snapshot')).data;
  assert.equal(snapshot.rosters.length,1);assert.deepEqual(snapshot.rosters[0].members,[fixture]);
});
test('two devices read the same submitted record; correction draft retains prior formal statistics and server actor',async()=>{
  await saveRoster();const submitted=await request(endpoint,'admin',body);assert.equal(submitted.status,200);
  const saved=submitted.data.record;assert.equal(saved.audit[0].actor,'supergary');
  const second=(await request('/academic/snapshot')).data.attendance[0];assert.deepEqual(second.record,saved);
  const changed=await request(endpoint,'admin',{revision:1,phase:'draft',rows:[{...row,status:''}],audit:[{actor:'fake'}]});
  assert.equal(changed.status,200);assert.equal(changed.data.record.phase,'draft');assert.equal(changed.data.record.submittedRows[0].status,'present');
  assert.equal((await request(endpoint,'admin',{...body,revision:1})).status,409);
});
test('server validates future submissions, malformed dates, identities, absence reasons and late duration',async()=>{
  await saveRoster();
  assert.equal((await request('/academic/attendance/U15A-03/2999-01-01/regular','admin',body)).status,400);
  assert.equal((await request('/academic/attendance/U15A-03/2026-02-30/regular','admin',body)).status,400);
  assert.equal((await request(endpoint,'admin',{...body,rows:[{...row,id:'unknown'}]})).status,409);
  assert.equal((await request(endpoint,'admin',{...body,rows:[{...row,status:'absent'}]})).status,400);
  assert.equal((await request(endpoint,'admin',{...body,rows:[{...row,status:'late',lateMinutes:15}]})).status,400);
});
test('temporary attendees must come from accessible rosters, not a caller-supplied name',async()=>{
  await saveRoster('U12B-07','admin',0,[]);await saveRoster('U12A-06');
  const r=await request('/academic/attendance/U12B-07/2026-01-03/regular','brook',{revision:0,phase:'draft',rows:[{...row,temporary:true}]});
  assert.equal(r.status,409);
});
test('removing a student from a roster does not delete their historical attendance',async()=>{
  await saveRoster();await request(endpoint,'admin',body);await saveRoster(classId,'admin',1,[]);
  const snapshot=(await request('/academic/snapshot')).data;assert.equal(snapshot.rosters[0].members.length,0);assert.equal(snapshot.attendance[0].record.rows[0].id,fixture.id);
});
test('holidays require manager, block attendance, and cannot erase a date with existing attendance',async()=>{
  await saveRoster();
  assert.equal((await request('/academic/holidays/'+date,'brook',{revision:0,active:true,note:'Holiday'})).status,403);
  assert.equal((await request('/academic/holidays/'+date,'admin',{revision:0,active:true,note:'Holiday'})).status,200);
  assert.equal((await request(endpoint,'admin',body)).status,409);
  await request('/academic/holidays/'+date,'admin',{revision:1,active:false,note:''});await request(endpoint,'admin',body);
  assert.equal((await request('/academic/holidays/'+date,'admin',{revision:2,active:true,note:'Holiday'})).status,409);
});
test('legacy migration is idempotent, preserves identities and history, never replaces existing server records',async()=>{
  const payload={rosters:{[classId]:[fixture]},attendance:[{classId,date,session:'regular',record:{rows:[row],phase:'submitted',savedAt:'2026-01-03T06:00:00.000Z'}}],holidays:[]};
  const first=await request('/academic/migrate','admin',payload);assert.equal(first.status,200);assert.equal(first.data.rosters,1);assert.equal(first.data.attendance,1);
  const second=await request('/academic/migrate','admin',payload);assert.equal(second.status,200);assert.equal(second.data.rosters,0);assert.equal(second.data.attendance,0);assert.equal(second.data.skipped.length,2);
  const snapshot=(await request('/academic/snapshot')).data;assert.equal(snapshot.rosters[0].members[0].id,fixture.id);assert.equal(snapshot.attendance[0].record.savedAt,'2026-01-03T06:00:00.000Z');
  assert.equal((await request('/academic/migrate','brook',payload)).status,403);
});
test('corrupt migrations roll back everything; preserve originals instead of silently treating invalid data as empty',async()=>{
  const result=await request('/academic/migrate','admin',{rosters:{[classId]:[fixture]},attendance:[{classId,date,session:'regular',record:{rows:[row],savedAt:'broken'}}]});
  assert.equal(result.status,400);assert.equal((await request('/academic/snapshot')).data.rosters.length,0);
});
test('validation rejects duplicate identities and retains submitted snapshots during corrections',()=>{
  assert.equal(validDate('2026-02-30'),false);assert.throws(()=>members([fixture,fixture]));
  const record=attendanceRecord(null,{rows:[row],phase:'submitted'},{username:'fixture'},date);
  assert.equal(attendanceRecord(record,{rows:[{...row,status:''}],phase:'draft'},{username:'fixture'},date).submittedRows[0].status,'present');
  assert.throws(()=>importedRecord({rows:[row],savedAt:'invalid'},{username:'fixture'},date));
});
