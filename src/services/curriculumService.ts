import { getValidAccessToken } from './authService';
import type { MonthPlan } from '../../shared/monthlyCurriculum.mjs';
export interface MonthRecord { month:number; revision:number; published:MonthPlan; draft:MonthPlan|null; state:'published'|'draft'|'submitted'; note:string|null }
export interface CurriculumWorkspace {permissions:{edit:boolean;publish:boolean};months:MonthRecord[]}
export interface CurriculumVersion {revision:number;action:string;published:MonthPlan;draft:MonthPlan|null;actor:string;created_at:string}
const base=(import.meta.env.VITE_CURRICULUM_API_URL?.trim()||'/api').replace(/\/$/,'');
async function request<T>(path:string, secured=false, body?:unknown):Promise<T> {
  const token=secured?await getValidAccessToken():null;
  if(secured&&!token)throw new Error('登录已失效，请重新登录后再操作。');
  const res=await fetch(`${base}/curriculum${path}`,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!res.headers.get('content-type')?.includes('application/json'))throw new Error('课程编辑服务尚未连接，当前展示初始大纲；连接后才能保存和发布。');
  const data=await res.json();if(!res.ok)throw new Error(data.message||'课程服务暂不可用');return data;
}
export const curriculumApi={
  published:(level:string)=>request<{months:MonthPlan[]}>(`/${level}`),
  workspace:(level:string)=>request<CurriculumWorkspace>(`/${level}/workspace`,true),
  history:(level:string,month:number)=>request<CurriculumVersion[]>(`/${level}/${month}/history`,true),
  act:(level:string,month:number,body:{revision:number;action:string;content?:MonthPlan;note?:string;version?:number})=>request<MonthRecord>(`/${level}/${month}`,true,body),
};
