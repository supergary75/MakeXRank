import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { makeupPlanError, emptyMakeupPlan, type MakeupPlan } from '../../shared/makeupPlans.mjs';
import { buildLeaveEntries, leaveKey, listMakeupPlans, persistMakeupPlan } from './leaveMakeups';
import { listAttendance, saveAttendance, type AttendanceRow } from './attendance';
import LeaveMakeupTable from './LeaveMakeupTable';
import AttendanceDashboard from './AttendanceDashboard';
import type { AuthUserProfile } from '../types';

const user:AuthUserProfile={authUserId:'fixture-admin',username:'supergary',displayName:'Fixture',role:'admin',isActive:true,createdAt:'',allowedEventTypes:null,allowedCompetitionIds:null};
const source={classId:'U15A-03',date:'2026-10-24',session:'regular',memberId:'fixture'};
const row:AttendanceRow={id:'fixture',name:'Fixture Student',status:'absent',reason:'事假',detail:''};
const plan:MakeupPlan={status:'scheduled',date:'2026-10-28',startTime:'13:00',endTime:'15:00'};
let memory:Map<string,string>;
beforeEach(()=>{
  memory=new Map();vi.stubGlobal('localStorage',{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>memory.set(key,value),key:(index:number)=>[...memory.keys()][index]??null,get length(){return memory.size;}});
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-20T06:00:00Z'));
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const leave=(date=source.date,session=source.session,classId=source.classId)=>saveAttendance(date,classId,session,[row],'draft','fixture','');
it('lists the whole week including future leave drafts, repeats and separate extra sessions but excludes other classes',()=>{
  leave();leave(source.date,'extra1');leave('2026-10-25');leave('2026-10-26');leave(source.date,'regular','U12A-06');
  const entries=buildLeaveEntries(listAttendance(true).records,[source.classId],'2026-10-19','2026-10-25');
  expect(entries).toHaveLength(3);expect(new Set(entries.map(e=>e.key)).size).toBe(3);expect(entries.every(e=>e.draft)).toBe(true);
  expect(buildLeaveEntries(listAttendance(true).records,[source.classId],'','2026-10-25')).toEqual([]);
});
it('saves and reloads an independently versioned makeup without changing source attendance or formal statistics',async()=>{
  leave();const original=JSON.stringify(listAttendance(true));
  const saved=await persistMakeupPlan(source,plan,0,'supergary');
  expect(saved.revision).toBe(1);expect(listMakeupPlans()).toEqual([saved]);expect(JSON.stringify(listAttendance(true))).toBe(original);
  await expect(persistMakeupPlan(source,plan,0,'fixture')).rejects.toThrow('更新');
  await persistMakeupPlan(source,{...emptyMakeupPlan(),status:'waived'},1,'fixture');expect(listMakeupPlans()[0].revision).toBe(2);
  expect(leaveKey(source)).not.toBe(leaveKey({...source,session:'extra1'}));
});
it('does not create makeup plans without actual leave or overwrite corrupt storage',async()=>{
  await expect(persistMakeupPlan(source,plan,0,'fixture')).rejects.toThrow('请假');
  leave();memory.set('makexrank-makeup-plans-v1','broken');
  await expect(persistMakeupPlan(source,plan,0,'fixture')).rejects.toThrow();expect(memory.get('makexrank-makeup-plans-v1')).toBe('broken');
});
it('validates complete, ordered time slots and forbids prematurely marking future makeup complete',()=>{
  expect(makeupPlanError(plan)).toBe('');expect(makeupPlanError({...plan,date:'2026-02-30'})).toContain('日期');
  expect(makeupPlanError({...plan,endTime:'12:00'})).toContain('结束时间');expect(makeupPlanError({...plan,status:'completed'})).toContain('尚未结束');
  expect(makeupPlanError({...plan,status:'completed',date:'2026-10-19'})).toBe('');expect(makeupPlanError({...emptyMakeupPlan(),status:'waived'})).toBe('');
});
it('renders weekly leave names and accessible editable makeup controls in the statistics page',()=>{
  leave();const html=renderToStaticMarkup(<AttendanceDashboard user={user}/>);
  expect(html).toContain('本周请假与补课安排');expect(html).toContain('2026-10-19');expect(html).toContain('2026-10-25');expect(html).toContain(row.name);
  for(const label of ['补课状态','补课日期','补课开始时间','补课结束时间','保存安排'])expect(html).toContain(label);
  expect(html).toContain('请假草稿／提前登记');expect(html).toContain('本地预览');
  expect(renderToStaticMarkup(<LeaveMakeupTable user={user} classIds={['U12A-06']}/>)).not.toContain(row.name);
  expect(renderToStaticMarkup(<AttendanceDashboard user={null}/>)).not.toContain(row.name);
});
