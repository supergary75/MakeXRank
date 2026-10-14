import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {curriculumLevels,curriculumPermissions,transitionMonth,validateMonth} from '../shared/curriculumWorkflow.mjs';
import {monthlyCurriculum} from '../shared/monthlyCurriculum.mjs';
import {mountCurriculumRoutes} from './curriculum.mjs';
const actor=(username,role='coach')=>({username,role,is_active:true});
const gary=actor('supergary','admin'),brook=actor('BrookY');
const original=monthlyCurriculum.U9[0];
const changed={...original,title:'新的月度主题'};
const baseline=()=>({revision:0,published:original,draft:null,state:'published',note:null});
const fail=(fn,status)=>assert.throws(fn,e=>e.status===status);
test('权限矩阵不依赖显示名，停用账户没有权限',()=>{
  for(const level of curriculumLevels){
    assert.equal(curriculumPermissions(gary,level).publish,true);
    for(const name of ['brooky','JasonZ'])assert.equal(curriculumPermissions(actor(name),level).edit,['U9','U12B','U12A'].includes(level));
    assert.equal(curriculumPermissions(actor('VincentC'),level).edit,level==='U15B');
    assert.equal(curriculumPermissions(actor('lisaW','admin'),level).edit,false);
    assert.equal(curriculumPermissions({...gary,is_active:false},level).edit,false);
    assert.equal(curriculumPermissions({...actor('other','admin'),display_name:'supergary'},level).publish,false);
  }
});
test('保存、提交、退回、发布及恢复全过程',()=>{
  let row=transitionMonth(baseline(),{revision:0,action:'save',content:changed},brook,'U9');
  assert.deepEqual(row.published,original);
  row=transitionMonth(row,{revision:1,action:'submit'},brook,'U9');
  fail(()=>transitionMonth(row,{revision:2,action:'save',content:changed},brook,'U9'),409);
  fail(()=>transitionMonth(row,{revision:2,action:'publish'},brook,'U9'),403);
  row=transitionMonth(row,{revision:2,action:'return',note:'增加测试成果'},gary,'U9');
  assert.equal(row.note,'增加测试成果');
  row=transitionMonth(row,{revision:3,action:'submit'},brook,'U9');
  row=transitionMonth(row,{revision:4,action:'publish'},gary,'U9');
  assert.deepEqual(row.published,changed);assert.equal(row.draft,null);
  row=transitionMonth(row,{revision:5,action:'restore',restoredContent:original},gary,'U9');
  assert.deepEqual(row.published,original);assert.equal(row.revision,6);
});
test('冲突、越权和非法内容不能修改原记录',()=>{
  const row=baseline();
  fail(()=>transitionMonth(row,{revision:1,action:'save',content:changed},brook,'U9'),409);
  fail(()=>transitionMonth(row,{revision:0,action:'save',content:changed},brook,'U18A'),403);
  fail(()=>transitionMonth(row,{revision:0,action:'submit'},brook,'U9'),409);
  fail(()=>validateMonth({...changed,title:' '}),400);
  fail(()=>validateMonth({...changed,title:'x'.repeat(101)}),400);
  assert.deepEqual(row,baseline());
});
test('七级十二个月初始内容均完整',()=>{
  for(const level of curriculumLevels){assert.equal(monthlyCurriculum[level].length,12);monthlyCurriculum[level].forEach(validateMonth);}
});
test('HTTP公开内容不泄漏草稿；只读用户无工作区与修改权限',async()=>{
  let rolledBack=false;
  const db={async query(sql){
    if(sql.startsWith('select auth_user_id'))return {rows:[actor('lisaW','admin')]};
    if(sql.startsWith('select month,published'))return {rows:[{month:1,published:original}]};
    if(sql==='rollback')rolledBack=true;
    return {rows:[]};
  },release(){}};
  const pool={query:db.query,async connect(){return db;}};
  const app=express();app.use(express.json());
  await mountCurriculumRoutes(app,pool,(req,res,next)=>{req.user={sub:'test'};next();});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/curriculum`;
  try{
    const pub=await (await fetch(`${base}/U9`)).json();assert.equal(pub.months.length,12);assert.deepEqual(pub.months[0],original);assert.equal(pub.months[0].draft,undefined);
    const work=await (await fetch(`${base}/U9/workspace`)).json();assert.deepEqual(work.months,[]);assert.equal(work.permissions.edit,false);
    assert.equal((await fetch(`${base}/U9/1/history`)).status,403);
    assert.equal((await fetch(`${base}/U9/1`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',revision:0,content:changed})})).status,403);
    assert.equal(rolledBack,true);
    assert.equal((await fetch(`${base}/invalid`)).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
