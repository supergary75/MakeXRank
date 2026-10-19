import type { AuthUserProfile } from '../types';
import type { Rosters, Member } from '../components/classRoster';
import type { AttendanceRecord, AttendanceRow } from '../components/attendance';
import type { ClubHoliday } from '../components/clubHolidays';
import { getValidAccessToken } from './authService';

export type CloudRoster = {class_id:string;revision:number;members:Member[]};
export type CloudAttendance = {class_id:string;date:string;session:string;revision:number;record:AttendanceRecord};
export type CloudHoliday = ClubHoliday & {revision:number};
export interface AcademicSnapshot {
  permissions:{all:boolean;coach:string|null;write:boolean};classIds:string[];
  rosters:CloudRoster[];attendance:CloudAttendance[];holidays:CloudHoliday[];
}
type CloudState = {account:string;phase:'local'|'signed-out'|'loading'|'ready'|'error';snapshot:AcademicSnapshot|null;message:string;pending:number;updatedAt:string};
export const academicCloudEnabled = import.meta.env.PROD || Boolean(import.meta.env.VITE_ACADEMIC_API_URL?.trim());
const base=(import.meta.env.VITE_ACADEMIC_API_URL?.trim() || '/api').replace(/\/$/,'');
let state:CloudState={account:'',phase:academicCloudEnabled?'signed-out':'local',snapshot:null,message:'',pending:0,updatedAt:''};
let generation=0, writeEpoch=0, refreshInFlight:Promise<void>|null=null;
const listeners=new Set<()=>void>();
export const getAcademicState=()=>state;
export const subscribeAcademic=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};};
function emit(patch:Partial<CloudState>) {
  state={...state,...patch};listeners.forEach(fn=>fn());
  if(typeof window!=='undefined')for(const event of ['academic-updated','class-rosters-updated','attendance-updated'])window.dispatchEvent(new Event(event));
}
const cacheKey=(account:string)=>`makexrank-academic-cache-v1:${base}:${account}`;
function isSnapshot(value:unknown):value is AcademicSnapshot {
  if(!value||typeof value!=='object')return false;
  const s=value as AcademicSnapshot;
  return !!s.permissions&&typeof s.permissions.all==='boolean'&&typeof s.permissions.write==='boolean'
    &&Array.isArray(s.classIds)&&s.classIds.every(id=>typeof id==='string')
    &&Array.isArray(s.rosters)&&s.rosters.every(r=>r&&typeof r.class_id==='string'&&Number.isInteger(r.revision)&&Array.isArray(r.members)&&r.members.every(m=>m&&typeof m.id==='string'&&typeof m.name==='string'))
    &&Array.isArray(s.attendance)&&s.attendance.every(e=>e&&typeof e.class_id==='string'&&typeof e.date==='string'&&typeof e.session==='string'&&Number.isInteger(e.revision)&&e.record&&Array.isArray(e.record.rows)&&typeof e.record.savedAt==='string')
    &&Array.isArray(s.holidays)&&s.holidays.every(h=>h&&typeof h.date==='string'&&typeof h.active==='boolean'&&Number.isInteger(h.revision));
}
const unsavedKey=(account:string)=>`makexrank-academic-unsaved-v1:${base}:${account}`;
export function unsavedAcademicChanges() {
  if(!state.account)return {};
  return JSON.parse(localStorage.getItem(unsavedKey(state.account))||'{}') as Record<string,unknown>;
}
function cache(snapshot:AcademicSnapshot) {
  // A failed cache write must not turn an acknowledged server commit into a failed save.
  try{localStorage.setItem(cacheKey(state.account),JSON.stringify(snapshot));}catch{/* server remains authoritative */}
}
async function request<T>(path:string, body?:unknown):Promise<T> {
  const account=state.account, stamp=generation;
  const send=async(force=false)=>{
    const token=await getValidAccessToken(force);
    if(!token)throw new Error('登录已失效，请重新登录。');
    if(stamp!==generation || account!==state.account)throw new Error('账号已变化，请重新进入工作台。');
    return fetch(`${base}/academic${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(12000)});
  };
  let response=await send();if(response.status===401)response=await send(true);
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('教务同步服务尚未部署或连接，未写入云端。');
  const data=await response.json();
  if(!response.ok)throw new Error(data.message || `教务服务错误（${response.status}）`);
  if(stamp!==generation || account!==state.account)throw new Error('账号已变化，请重新进入工作台。');
  return data as T;
}
export function startAcademicCloud(user:AuthUserProfile|null) {
  generation++;refreshInFlight=null;
  if(!academicCloudEnabled)return;
  const account=user?.isActive?user.authUserId:'';
  let snapshot:AcademicSnapshot|null=null;
  if(account)try{const candidate:unknown=JSON.parse(localStorage.getItem(cacheKey(account)) || 'null');snapshot=isSnapshot(candidate)?candidate:null;}catch{/* preserve corrupt cache; fetch clean server data */}
  emit({account,snapshot,phase:account?'loading':'signed-out',pending:0,message:'',updatedAt:''});
  if(account)void refreshAcademic();
}
export async function refreshAcademic():Promise<void> {
  if(!academicCloudEnabled || !state.account || state.pending)return;
  if(refreshInFlight)return refreshInFlight;
  const stamp=generation, epoch=writeEpoch;
  const task=(async()=>{
    try{
      const snapshot=await request<AcademicSnapshot>('/snapshot');
      if(stamp!==generation || epoch!==writeEpoch)return;
      if(!isSnapshot(snapshot))throw new Error('云端教务数据格式不正确。');
      cache(snapshot);emit({snapshot,phase:'ready',message:'',updatedAt:new Date().toISOString()});
    }catch(error){if(stamp===generation)emit({phase:'error',message:error instanceof Error?error.message:'连接失败，请检查网络后重试。'});}
  })();
  refreshInFlight=task;await task;if(refreshInFlight===task)refreshInFlight=null;
}
export function cloudSnapshot():AcademicSnapshot {
  if(!state.account)throw new Error('请先登录查看班级与出勤。');
  if(!state.snapshot)throw new Error(state.message || '正在连接教务数据库，请稍候。');
  return state.snapshot;
}
async function write<T>(path:string,body:unknown,apply:(snapshot:AcademicSnapshot,result:T)=>AcademicSnapshot):Promise<T> {
  const snapshot=cloudSnapshot();
  if(state.phase!=='ready'||!snapshot.permissions.write)throw new Error(state.phase!=='ready'?'尚未连接云端，当前仅可查看缓存。请重连后保存。':'当前账号没有编辑权限。');
  if(state.pending)throw new Error('上一项修改仍在保存，请稍候再操作。');
  const draftKey=path==='/rosters'?`${path}:${Object.keys((body as {changes:Rosters}).changes).sort().join(',')}`:path;
  const stamp=generation;writeEpoch++;emit({pending:1,message:''});
  try{
    const result=await request<T>(path,body), next=apply(cloudSnapshot(),result);
    cache(next);
    try{const drafts=unsavedAcademicChanges();delete drafts[draftKey];localStorage.setItem(unsavedKey(state.account),JSON.stringify(drafts));}catch{/* never fail an acknowledged cloud save */}
    emit({snapshot:next,updatedAt:new Date().toISOString(),message:''});return result;
  }catch(error){
    if(stamp===generation){
      let backup='';
      try{localStorage.setItem(unsavedKey(state.account),JSON.stringify({...unsavedAcademicChanges(),[draftKey]:{path,body,attemptedAt:new Date().toISOString()}}));backup=' 本次修改已另存本机未同步备份，不会覆盖云端；可下载备份核对。';}catch{backup=' 本机备份也未成功，请勿关闭本页，先手动保留本次内容。';}
      emit({message:(error instanceof Error?error.message:'未保存，请重试。')+backup});
    }
    throw error;
  }
  finally{if(stamp===generation)emit({pending:0});}
}
export async function saveCloudRosters(changes:Rosters,expected:Rosters):Promise<Rosters> {
  const snapshot=cloudSnapshot(), revisions:Record<string,number>={};
  for(const id of Object.keys(changes)) {
    const row=snapshot.rosters.find(r=>r.class_id===id);
    if(JSON.stringify(row?.members)!==JSON.stringify(expected[id]))throw new Error(`班级 ${id} 已被更新，请重新加载后核对。`);
    revisions[id]=row?.revision ?? 0;
  }
  const result=await write<{rosters:CloudRoster[]}>('/rosters',{changes,revisions},(s,r)=>({...s,rosters:[...s.rosters.filter(old=>!r.rosters.some(n=>n.class_id===old.class_id)),...r.rosters]}));
  return Object.fromEntries([...snapshot.rosters.filter(old=>!result.rosters.some(n=>n.class_id===old.class_id)),...result.rosters].map(r=>[r.class_id,r.members]));
}
export async function saveCloudAttendance(date:string,classId:string,session:string,rows:AttendanceRow[],phase:'draft'|'submitted',expected:string):Promise<AttendanceRecord> {
  const previous=cloudSnapshot().attendance.find(r=>r.class_id===classId&&r.date===date&&r.session===session);
  if((previous?.record.savedAt ?? '')!==expected)throw new Error('其他设备已更新此课次，请重新加载后核对。');
  const result=await write<{revision:number;record:AttendanceRecord}>(`/attendance/${encodeURIComponent(classId)}/${date}/${session}`,{revision:previous?.revision ?? 0,rows,phase},(s,r)=>({...s,attendance:[...s.attendance.filter(e=>!(e.class_id===classId&&e.date===date&&e.session===session)),{class_id:classId,date,session,...r}]}));
  return result.record;
}
export async function saveCloudHoliday(date:string,note:string,active:boolean):Promise<ClubHoliday[]> {
  const previous=cloudSnapshot().holidays.find(h=>h.date===date);
  await write<CloudHoliday>(`/holidays/${date}`,{revision:previous?.revision ?? 0,note,active},(s,r)=>({...s,holidays:[...s.holidays.filter(h=>h.date!==date),r]}));
  return cloudSnapshot().holidays;
}
export function localAcademicMigration() {
  const rosters=JSON.parse(localStorage.getItem('makexrank-class-members-v1') || '{}') as Rosters;
  const holidays=JSON.parse(localStorage.getItem('makexrank-club-holidays-v1') || '[]') as ClubHoliday[];
  const attendance:{classId:string;date:string;session:string;record:AttendanceRecord}[]=[];
  for(let i=0;i<localStorage.length;i++) {
    const key=localStorage.key(i) || '';
    if(!key.startsWith('makexrank-attendance-v1:'))continue;
    const [,date,classId,session='regular']=key.split(':');
    attendance.push({classId,date,session,record:JSON.parse(localStorage.getItem(key)!)});
  }
  if(!rosters||typeof rosters!=='object'||Array.isArray(rosters)||Object.values(rosters).some(r=>!Array.isArray(r))||!Array.isArray(holidays))throw new Error('本地备份格式异常，未上传或修改任何数据。');
  return {rosters,attendance,holidays};
}
export function parseAcademicMigration(text:string):ReturnType<typeof localAcademicMigration> {
  const data=JSON.parse(text);
  const payload={rosters:data.rosters ?? {},attendance:data.attendance ?? [],holidays:data.holidays ?? []};
  if(!payload.rosters||typeof payload.rosters!=='object'||Array.isArray(payload.rosters)||Object.values(payload.rosters).some(r=>!Array.isArray(r))||!Array.isArray(payload.attendance)||!Array.isArray(payload.holidays))throw new Error('教务备份格式不正确。');
  if(!Object.keys(payload.rosters).length&&!payload.attendance.length&&!payload.holidays.length)throw new Error('备份中没有班级、点名或放假安排。');
  return payload;
}
export async function migrateAcademic(payload:ReturnType<typeof localAcademicMigration>) {
  const report=await write<{rosters:number;attendance:number;holidays:number;skipped:string[]}>('/migrate',payload,s=>s);
  await refreshAcademic();return report;
}
