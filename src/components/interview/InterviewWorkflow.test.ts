import { describe, expect, it } from 'vitest';
import { canRead, createInterview, transitionInterview, reminderPlan, type Interview, type Staff } from '../../../shared/interviewWorkflow.mjs';
import { defaultTemplates, updateTemplate } from '../../../shared/interviewTemplates.mjs';
const lisa: Staff = {id:'lisa',name:'Lisa',role:'manager',canInitiate:true};
const gary: Staff = {id:'gary',name:'Gary',role:'coach',canInitiate:true};
const brook: Staff = {id:'brook',name:'Brook',role:'coach',canInitiate:false};
const jason: Staff = {id:'jason',name:'Jason',role:'coach',canInitiate:false};
const vincent: Staff = {id:'vincent',name:'Vincent',role:'coach',canInitiate:false};
const supergary: Staff = {id:'gary',name:'supergary',role:'coach',canInitiate:true};
const now = '2026-09-04T00:00:00Z';
const input = {id:'00000000-0000-4000-8000-000000000001',studentName:'虚构学员',grade:'三年级',course:'机器人',coachId:'gary',scheduledAt:'2026-09-06T02:00:00Z'};
const make = (actor = lisa) => createInterview(input,actor,[gary,brook],now);
const act = (r: Interview, actor:Staff, action:string, extra = {}) => transitionInterview(r,actor,{action,version:r.version,...extra},now);
describe('interview workflow',()=>{
  it('lets Lisa and Gary initiate, but not other coaches',()=>{
    expect(make(lisa).managerId).toBe('lisa'); expect(make(gary).managerId).toBe('gary');
    expect(()=>make(brook)).toThrow('发起权限');
  });
  it('Gary can assign another coach and manage only his own record',()=>{
    const own = createInterview({...input,coachId:'brook'},gary,[gary,brook],now);
    const proposal = act(own,brook,'propose',{scheduledAt:'2026-09-07T02:00:00Z'});
    expect(act(proposal,gary,'confirm_time').status).toBe('confirmed');
    expect(()=>act(act(make(),gary,'propose',{scheduledAt:'2026-09-07T02:00:00Z'}),gary,'confirm_time')).toThrow('无权');
  });
  it('never permits unrelated coaches to read or change a record',()=>{
    expect(canRead(make(),brook)).toBe(false); expect(()=>act(make(),brook,'accept')).toThrow('无权');
  });
  it('does not mutate input and rejects stale versions',()=>{
    const before=make(); const after=act(before,gary,'accept');
    expect(before.status).toBe('pending_coach'); expect(after.version).toBe(2);
    expect(()=>transitionInterview(after,gary,{action:'start',version:1},now)).toThrow('刷新');
  });
  it('keeps original time until initiator confirms and cancels reminder plan during negotiation',()=>{
    const accepted=act(make(),gary,'accept');
    expect(reminderPlan(accepted,now)).toHaveLength(3);
    const proposal=act(accepted,gary,'propose',{scheduledAt:'2026-09-07T02:00:00Z'});
    expect(proposal.scheduledAt).toBe(accepted.scheduledAt); expect(reminderPlan(proposal,now)).toEqual([]);
    const confirmed=act(proposal,lisa,'confirm_time');
    expect(confirmed.scheduledAt).toBe('2026-09-07T02:00:00.000Z');
    expect(reminderPlan(confirmed,now)[0].key).not.toBe(reminderPlan(accepted,now)[0].key);
  });
  it('requires coach acceptance after an initiator counteroffer',()=>{
    const proposal=act(make(),gary,'propose',{scheduledAt:'2026-09-07T02:00:00Z'});
    const counter=act(proposal,lisa,'counter_time',{scheduledAt:'2026-09-08T02:00:00Z'});
    expect(counter.status).toBe('pending_coach'); expect(act(counter,gary,'accept').status).toBe('confirmed');
  });
  it('does not backfill expired reminder nodes',()=>{
    const accepted=act(make(),gary,'accept');
    expect(reminderPlan(accepted,'2026-09-06T01:15:00Z').map(r=>r.minutes)).toEqual([30]);
  });
  it('blocks templates/final report completion, preserving drafts',()=>{
    let r=act(make(),gary,'accept'); r=act(r,gary,'start'); r=act(r,gary,'finish');
    r=act(r,gary,'save_report',{report:'只记录观察事实'});
    expect(r.report).toBe('只记录观察事实'); expect(()=>act(r,gary,'finalize')).toThrow('尚未接入');
    expect(()=>act(r,lisa,'archive')).toThrow('当前阶段');
  });
  it('archives closure only after a reason, and retains history',()=>{
    expect(()=>act(make(),lisa,'cancel',{reason:''})).toThrow('原因');
    const cancelled=act(make(),lisa,'cancel',{reason:'测试结案'});
    expect(cancelled.archivedAt).toBeNull();
    const archived=act(cancelled,lisa,'archive');
    expect(archived.archivedAt).toBe(now); expect(archived.history).toHaveLength(3);
    expect(()=>act(archived,lisa,'counter_time',{scheduledAt:input.scheduledAt})).toThrow('归档');
  });
  it('retains a saved report draft in a closure archive',()=>{
    let record=act(make(),gary,'accept'); record=act(record,gary,'start'); record=act(record,gary,'finish');
    record=act(record,gary,'save_report',{report:'需要保留的观察草稿'});
    record=act(record,lisa,'cancel',{reason:'测试结案'}); record=act(record,lisa,'archive');
    expect(record.report).toBe('需要保留的观察草稿'); expect(record.status).toBe('archived');
  });
  it('rejects past times, timezone-less times and unbound coaches',()=>{
    expect(()=>createInterview({...input,scheduledAt:now},lisa,[gary],now)).toThrow('未来');
    expect(()=>createInterview({...input,scheduledAt:'2026-09-06T10:00'},lisa,[gary],now)).toThrow('时区');
    expect(()=>createInterview({...input,coachId:'unknown'},lisa,[gary],now)).toThrow('绑定');
  });
});
describe('interview template library',()=>{
  it('ships exactly four editable level templates',()=>expect(defaultTemplates(now).map(item=>item.level)).toEqual(['U9','U12','U15','U18']));
  it('gives Gary every template and assigned coaches only their levels',()=>{
    const [u9,u12,u15,u18]=defaultTemplates(now);
    const next=updateTemplate(u9,{version:1,name:'U9 新模板',description:'测试',sections:['观察','建议']},gary,now);
    expect(next.version).toBe(2); expect(next.updatedBy).toBe('gary'); expect(u9.version).toBe(1);
    expect(updateTemplate(u9,{version:1,name:'U9',description:'',sections:['观察']},brook,now).version).toBe(2);
    expect(updateTemplate(u12,{version:1,name:'U12',description:'',sections:['观察']},jason,now).version).toBe(2);
    expect(updateTemplate(u15,{version:1,name:'U15',description:'',sections:['观察']},vincent,now).version).toBe(2);
    expect(updateTemplate(u18,{version:1,name:'U18',description:'',sections:['观察']},gary,now).version).toBe(2);
    expect(updateTemplate(u15,{version:1,name:'U15',description:'',sections:['观察']},supergary,now).version).toBe(2);
  });
  it('makes Lisa read-only and blocks coaches outside assigned levels',()=>{
    const [u9,,u15,u18]=defaultTemplates(now); const input={version:1,name:'模板',description:'',sections:['观察']};
    expect(()=>updateTemplate(u9,input,lisa,now)).toThrow('没有 U9');
    expect(()=>updateTemplate(u15,input,brook,now)).toThrow('没有 U15');
    expect(()=>updateTemplate(u18,input,vincent,now)).toThrow('没有 U18');
  });
  it('rejects stale and duplicate edits',()=>{
    const original=defaultTemplates(now)[0];
    expect(()=>updateTemplate(original,{version:0,name:'U9',description:'',sections:['观察']},gary,now)).toThrow('刷新');
    expect(()=>updateTemplate(original,{version:1,name:'U9',description:'',sections:['观察','观察']},gary,now)).toThrow('重复');
  });
});
