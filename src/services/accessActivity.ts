import {getValidAccessToken} from './authService';

export type AccessLogRow={id:string;username:string;displayName:string;loggedInAt:string;expiresAt:string;endedAt:string|null;endReason:string|null;passwordSetup:boolean;legacy:boolean};
export type AccessLogPage={rows:AccessLogRow[];total:number;nextBefore:string|null;trackingStartedAt:string};
export type AccessEvent={id:string;username:string;displayName:string;type:string;at:string};
export type AccessEvents={events:AccessEvent[];unreadCount:number;latestId:string};
export type AccessLogQuery={from:string;to:string;username?:string;before?:string};
const base=(import.meta.env.VITE_SUPABASE_URL?.trim()||'/MakeXRank/api').replace(/\/$/,'');
export const ACCESS_ACTIVITY_READ_EVENT='makexrank-access-activity-read';
async function request<T>(path:string,body?:unknown):Promise<T> {
  const token=await getValidAccessToken();
  if(!token)throw new Error('请使用 Gary 的管理员账号重新登录。');
  const response=await fetch(`${base}/auth/v1/${path}`,{method:body===undefined?'GET':'POST',cache:'no-store',
    headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(response.status===401?'登录已失效，请重新登录。':response.status===403?'只有 Gary（supergary）可以查看登录记录。':'登录记录读取失败，请重试；日期范围最多 93 天。');
  return response.json() as Promise<T>;
}
export const fetchAccessLog=(query:AccessLogQuery)=>request<AccessLogPage>(`access-log?${new URLSearchParams({...query})}`);
export const fetchAccessEvents=()=>request<AccessEvents>('access-events');
export async function markAccessEventsSeen(through:string) {
  await request('access-events/seen',{through});
  window.dispatchEvent(new Event(ACCESS_ACTIVITY_READ_EVENT));
}
const timeFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function formatAccessTime(value:string|null) {
  if(!value||!Number.isFinite(Date.parse(value)))return '—';
  const parts=Object.fromEntries(timeFormat.formatToParts(new Date(value)).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
const labels:Record<string,string>={login:'登录网站',initial_verification:'通过初始密码验证（待改密）',logout:'主动退出',expired:'会话到期',password_changed:'完成个人密码设置',password_reset:'管理员重置密码，旧会话失效',account_disabled:'账号停用',account_deleted:'账号删除',revoked:'会话被撤销',legacy_revoked:'历史失效（原因未记录）'};
export const accessEventLabel=(type:string)=>labels[type]||'会话失效';
export const accessStatus=(row:AccessLogRow)=>row.endReason?accessEventLabel(row.endReason):row.passwordSetup?'待设置个人密码':'登录有效（不代表在线）';
export const accessEventMessage=(event:AccessEvent)=>`${event.displayName}（${event.username}）于 ${formatAccessTime(event.at)} ${accessEventLabel(event.type)}。`;
export function accessDate(offset=0,now=new Date()) {
  const date=new Date(now.getTime()+8*3600000+offset*86400000);
  return date.toISOString().slice(0,10);
}
