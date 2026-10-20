import {useEffect,useRef,useState} from 'react';
import type {AuthUserProfile} from '../../types';
import {canManageStaff} from '../../services/staffAccess';
import {accessDate,accessStatus,fetchAccessEvents,fetchAccessLog,formatAccessTime,markAccessEventsSeen,type AccessLogPage,type AccessLogQuery,type AccessLogRow} from '../../services/accessActivity';
import css from './LoginActivity.module.css';

export function AccessHistoryRows({rows}:{rows:AccessLogRow[]}) {
  return <div className={css.scroll}><table className={css.table}><thead><tr><th>人员 / 登录账号</th><th>登录时间</th><th>退出或失效时间</th><th>会话状态</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}>
    <th scope="row" data-label="人员 / 登录账号"><strong>{row.displayName}</strong><span>{row.username}</span>{row.passwordSetup&&<small>首次验证会话</small>}{row.legacy&&<small>历史会话 · 原系统留存</small>}</th>
    <td data-label="登录时间">{formatAccessTime(row.loggedInAt)}</td>
    <td data-label="退出或失效时间">{formatAccessTime(row.endedAt)}{!row.endedAt&&<small>有效至 {formatAccessTime(row.expiresAt)}</small>}</td>
    <td data-label="会话状态"><span className={row.endReason?css.closed:css.valid}>{accessStatus(row)}</span></td>
  </tr>)}</tbody></table></div>;
}
export default function LoginActivity({user,users}:{user:AuthUserProfile|null;users:AuthUserProfile[]}) {
  return canManageStaff(user)?<OwnerActivity key={user!.authUserId} users={users}/>:null;
}
function OwnerActivity({users}:{users:AuthUserProfile[]}) {
  const [from,setFrom]=useState(()=>accessDate(-6)),[to,setTo]=useState(()=>accessDate()),[username,setUsername]=useState(''),[version,setVersion]=useState(0);
  const [receiptBusy,setReceiptBusy]=useState(false),[message,setMessage]=useState('');
  const markRead=async()=>{
    setReceiptBusy(true);setMessage('');
    try{const current=await fetchAccessEvents();if(current.latestId!=='0')await markAccessEventsSeen(current.latestId);setMessage('当前登录动态已标记为已读，历史记录仍保留。');}
    catch(reason){setMessage(reason instanceof Error?reason.message:'标记失败，请重试。');}finally{setReceiptBusy(false);}
  };
  return <section className={css.activity} aria-label="登录与退出记录">
    <header><div><h3>登录与退出记录</h3><p>仅 Gary 可见 · 时间均为北京时间。记录登录、主动退出及会话失效原因，不记录密码或令牌。</p></div><button type="button" disabled={receiptBusy} onClick={()=>void markRead()}>{receiptBusy?'正在标记…':'登录提示全部标为已读'}</button></header>
    <div className={css.filters}>
      <label>开始日期<input type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label>
      <label>结束日期<input type="date" value={to} onChange={event=>setTo(event.target.value)}/></label>
      <label>登录账号<select value={username} onChange={event=>setUsername(event.target.value)}><option value="">全部账号</option>{[...new Map(users.map(user=>[user.username,user])).values()].map(user=><option key={user.username} value={user.username}>{user.displayName} · {user.username}</option>)}</select></label>
      <button type="button" onClick={()=>{setFrom(accessDate());setTo(accessDate());}}>今天</button><button type="button" onClick={()=>{setFrom(accessDate(-6));setTo(accessDate());}}>近7天</button><button type="button" onClick={()=>setVersion(value=>value+1)}>刷新记录</button>
    </div>
    {message&&<p role="status">{message}</p>}
    <LogResults key={`${from}:${to}:${username}:${version}`} query={{from,to,username}}/>
    <p className={css.explanation}>“登录有效”只表示凭证仍在 7 天有效期内，不代表一直在线。关闭网页、断网或锁屏不虚报退出；未主动退出的会话按到期时间记录。首次验证与完成改密后的正常登录会分开标记。历史记录的未知退出原因不会补造。</p>
  </section>;
}
function LogResults({query}:{query:AccessLogQuery}) {
  const [page,setPage]=useState<AccessLogPage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const mounted=useRef(false),expanded=useRef(false);
  const {from,to,username}=query;
  useEffect(()=>{
    mounted.current=true;let cancelled=false,inFlight=false;
    const load=async()=>{
      if(inFlight||expanded.current)return;inFlight=true;
      try{const next=await fetchAccessLog({from,to,username});if(!cancelled&&!expanded.current){setPage(next);setError('');}}
      catch(reason){if(!cancelled)setError(reason instanceof Error?reason.message:'登录记录读取失败。');}finally{inFlight=false;}
    };
    void load();const timer=window.setInterval(()=>{if(document.visibilityState!=='hidden')void load();},30000);
    return()=>{cancelled=true;mounted.current=false;window.clearInterval(timer);};
  },[from,to,username]);
  const loadMore=async()=>{
    if(!page?.nextBefore||busy)return;
    expanded.current=true;setBusy(true);setError('');
    try{const next=await fetchAccessLog({...query,before:page.nextBefore});if(mounted.current)setPage(previous=>({...next,rows:[...(previous?.rows||[]),...next.rows]}));}
    catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:'更早记录读取失败。');}finally{if(mounted.current)setBusy(false);}
  };
  return <>{error&&<p role="alert">{error}</p>}{!page&&!error&&<p role="status">正在读取服务器登录记录…</p>}{page&&<>
    <p>共 {page.total} 条会话，已显示 {page.rows.length} 条。详细记录开始于 {formatAccessTime(page.trackingStartedAt)}；更早的会话仅按旧系统留存信息展示。</p>
    {page.rows.length?<AccessHistoryRows rows={page.rows}/>:<p>这个日期范围内没有登录记录。</p>}
    {page.nextBefore&&<button type="button" disabled={busy} onClick={()=>void loadMore()}>{busy?'正在读取…':'加载更早记录'}</button>}
  </>}</>;
}
