import { academicCloudEnabled, cloudSnapshot, saveCloudMakeup, type CloudMakeup } from '../services/academicCloud';
import { listAttendance } from './attendance';
import type { Entry } from './attendanceInsights';
import { makeupPlanError, type MakeupPlan } from '../../shared/makeupPlans.mjs';
import { validDate } from './rollCallSchedule';

export type LeaveSource = {classId:string;date:string;session:string;memberId:string};
export type LeaveEntry = LeaveSource & {key:string;name:string;reason:string;draft:boolean};
export const leaveKey = (source:LeaveSource) => JSON.stringify([source.classId,source.date,source.session,source.memberId]);
export const makeupSource = (plan:CloudMakeup):LeaveSource => ({classId:plan.class_id,date:plan.date,session:plan.session,memberId:plan.member_id});
export function buildLeaveEntries(entries:Entry[], classIds:string[], from:string, to:string):LeaveEntry[] {
  if(!validDate(from)||!validDate(to)||from>to)return [];
  return entries.filter(e=>classIds.includes(e.classId)&&e.date>=from&&e.date<=to).flatMap(e=>e.record.rows.filter(r=>r.status==='absent').map(row=>{
    const source={classId:e.classId,date:e.date,session:e.session,memberId:row.id};
    return {...source,key:leaveKey(source),name:row.name,reason:row.reason==='自定义'?'其他请假':row.reason || '请假',draft:e.record.phase!=='submitted'};
  })).sort((a,b)=>a.date.localeCompare(b.date)||a.classId.localeCompare(b.classId)||a.session.localeCompare(b.session)||a.name.localeCompare(b.name,'zh-CN'));
}
const localKey='makexrank-makeup-plans-v1';
export function listMakeupPlans():CloudMakeup[] {
  if(academicCloudEnabled)return cloudSnapshot().makeups ?? [];
  const data:unknown=JSON.parse(localStorage.getItem(localKey)||'[]');
  if(!Array.isArray(data)||data.some(m=>!m||typeof m.class_id!=='string'||!validDate(m.date)||!['regular','extra1','extra2'].includes(m.session)||typeof m.member_id!=='string'||!Number.isInteger(m.revision)||m.revision<1||makeupPlanError(m.plan)||typeof m.actor!=='string'||typeof m.updatedAt!=='string'))throw new Error('补课安排读取异常，请保留原记录后核对。');
  return data;
}
export async function persistMakeupPlan(source:LeaveSource,plan:MakeupPlan,expected:number,actor:string):Promise<CloudMakeup> {
  const error=makeupPlanError(plan);if(error)throw new Error(error);
  if(academicCloudEnabled)return saveCloudMakeup(source,plan,expected);
  const sourceRow=listAttendance(true).records.find(e=>e.classId===source.classId&&e.date===source.date&&e.session===source.session)?.record.rows.find(r=>r.id===source.memberId);
  if(sourceRow?.status!=='absent')throw new Error('请假记录已变化，请重新加载核对。');
  const saved=listMakeupPlans(), previous=saved.find(p=>leaveKey(makeupSource(p))===leaveKey(source));
  if((previous?.revision ?? 0)!==expected)throw new Error('其他页面已更新补课安排，请载入最新安排后核对。');
  const next:CloudMakeup={class_id:source.classId,date:source.date,session:source.session,member_id:source.memberId,plan:{...plan},revision:expected+1,actor,updatedAt:new Date().toISOString()};
  localStorage.setItem(localKey,JSON.stringify([...saved.filter(p=>leaveKey(makeupSource(p))!==leaveKey(source)),next]));
  if(typeof window!=='undefined')window.dispatchEvent(new Event('attendance-updated'));
  return next;
}
