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
beforeEach(async()=>{await db.exec('truncate academic_makeups,academic_rosters,academic_attendance,academic_holidays,academic_changes restart identity');});
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

const makeupEndpoint=`/academic/makeups/${classId}/${date}/regular/${fixture.id}`;
const makeupPlan={status:'scheduled',date:'2026-11-01',startTime:'13:00',endTime:'15:00'};
async function leaveFixture(id=classId,user='admin',lessonDate=date,session='regular') {
  await saveRoster(id);
  return request(`/academic/attendance/${id}/${lessonDate}/${session}`,user,{revision:0,phase:'draft',rows:[{...row,status:'absent',reason:'事假'}]});
}
test('makeup plans attach to actual leave, round-trip across devices, and do not modify attendance',async()=>{
  const source=await leaveFixture();
  const created=await request(makeupEndpoint,'admin',{revision:0,plan:makeupPlan,actor:'forged'});
  assert.equal(created.status,200);assert.equal(created.data.revision,1);assert.equal(created.data.actor,'supergary');assert.deepEqual(created.data.plan,makeupPlan);
  const other=(await request('/academic/snapshot')).data;
  assert.equal(other.makeups.length,1);assert.deepEqual(other.makeups[0],created.data);assert.deepEqual(other.attendance[0].record,source.data.record);
  assert.equal((await db.query("select count(*)::int as count from academic_changes where kind='makeup'")).rows[0].count,1);
  assert.equal((await request(makeupEndpoint,'admin',{revision:0,plan:{status:'waived',date:'',startTime:'',endTime:''}})).status,409);
  const updated=await request(makeupEndpoint,'admin',{revision:1,plan:{status:'waived',date:'',startTime:'',endTime:''}});
  assert.equal(updated.status,200);assert.equal(updated.data.revision,2);
  assert.equal((await request('/academic/snapshot')).data.makeups.length,1);
});
test('makeup plans remain class-scoped and deny guests, disabled accounts, viewers and other coaches',async()=>{
  await leaveFixture();await request(makeupEndpoint,'admin',{revision:0,plan:makeupPlan});
  for(const [user,status] of [[null,401],['disabled',401],['viewer',403],['brook',403],['imposter',403]])assert.equal((await request(makeupEndpoint,user,{revision:1,plan:makeupPlan})).status,status);
  assert.deepEqual((await request('/academic/snapshot','brook')).data.makeups,[]);
  assert.deepEqual((await request('/academic/snapshot','imposter')).data.makeups,[]);
  await leaveFixture('U12B-07');
  const own=await request(`/academic/makeups/U12B-07/${date}/regular/${fixture.id}`,'brook',{revision:0,plan:makeupPlan});
  assert.equal(own.status,200);assert.equal((await request('/academic/snapshot','brook')).data.makeups.length,1);
});
test('makeup validation rejects nonexistent/non-leave pupils and malformed or uncompleted future slots',async()=>{
  assert.equal((await request(makeupEndpoint,'admin',{revision:0,plan:makeupPlan})).status,409);
  await saveRoster();await request(endpoint,'admin',body);
  assert.equal((await request(makeupEndpoint,'admin',{revision:0,plan:makeupPlan})).status,409);
  await request(endpoint,'admin',{...body,revision:1,phase:'draft',rows:[{...row,status:'absent',reason:'病假'}]});
  for(const plan of [null,{...makeupPlan,date:'2026-02-30'},{...makeupPlan,startTime:'25:00'},{...makeupPlan,endTime:'12:00'},{...makeupPlan,status:'unknown'},{...makeupPlan,status:'completed',date:'2999-01-01'},{...makeupPlan,status:'waived'}])assert.equal((await request(makeupEndpoint,'admin',{revision:0,plan})).status,400);
  assert.equal((await request(makeupEndpoint.replace(fixture.id,'unknown'),'admin',{revision:0,plan:makeupPlan})).status,409);
  const result=await request(makeupEndpoint,'admin',{revision:0,plan:{...makeupPlan,status:'completed',date:'2026-01-04'}});
  assert.equal(result.status,200);
});
test('distinct leave dates and regular/extra lessons keep independent makeup plans after roster changes',async()=>{
  await saveRoster();
  for(const [d,s] of [[date,'regular'],[date,'extra1'],['2026-01-04','regular']]){
    await request(`/academic/attendance/${classId}/${d}/${s}`,'admin',{revision:0,phase:'draft',rows:[{...row,status:'absent',reason:'事假'}]});
    assert.equal((await request(`/academic/makeups/${classId}/${d}/${s}/${fixture.id}`,'admin',{revision:0,plan:makeupPlan})).status,200);
  }
  await saveRoster(classId,'admin',1,[]);
  assert.equal((await request('/academic/snapshot')).data.makeups.length,3);
  await request(endpoint,'admin',{...body,revision:1});
  assert.equal((await request(makeupEndpoint,'admin',{revision:1,plan:makeupPlan})).status,409);
  assert.equal((await request('/academic/snapshot')).data.makeups.length,3);
});
