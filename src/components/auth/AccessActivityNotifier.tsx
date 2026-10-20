import {useEffect,useRef,useState} from 'react';
import type {AuthUserProfile,NotificationType} from '../../types';
import {canManageStaff} from '../../services/staffAccess';
import {ACCESS_ACTIVITY_READ_EVENT,accessEventMessage,fetchAccessEvents,type AccessEvents} from '../../services/accessActivity';
import css from './LoginActivity.module.css';

type Props={user:AuthUserProfile|null;onOpen:()=>void;onNotify:(message:string,type:NotificationType)=>void};
export default function AccessActivityNotifier(props:Props) {
  return canManageStaff(props.user)?<OwnerNotifier key={props.user!.authUserId} {...props}/>:null;
}
function OwnerNotifier({onOpen,onNotify}:Props) {
  const [snapshot,setSnapshot]=useState<AccessEvents|null>(null),[error,setError]=useState('');
  const announced=useRef(new Set<string>());
  useEffect(()=>{
    let cancelled=false,inFlight=false;
    const refresh=async()=>{
      if(inFlight)return;inFlight=true;
      try {
        const next=await fetchAccessEvents();if(cancelled)return;
        setSnapshot(next);setError('');
        const fresh=next.events.filter(event=>!announced.current.has(event.id));
        fresh.forEach(event=>announced.current.add(event.id));
        if(fresh.length>2)onNotify(`有 ${next.unreadCount} 条未读登录/退出动态，请到员工后台查看。`,'info');
        else [...fresh].reverse().forEach(event=>onNotify(accessEventMessage(event),'info'));
      }catch(reason){if(!cancelled)setError(reason instanceof Error?reason.message:'登录动态暂时无法同步。');}
      finally{inFlight=false;}
    };
    void refresh();const timer=window.setInterval(()=>{if(document.visibilityState!=='hidden')void refresh();},30000);
    const update=()=>void refresh();window.addEventListener('focus',update);window.addEventListener(ACCESS_ACTIVITY_READ_EVENT,update);
    return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener(ACCESS_ACTIVITY_READ_EVENT,update);};
  },[onNotify]);
  return <aside className={css.notice} aria-label="登录动态提示">
    <div><strong>{error?'登录动态同步异常':snapshot?`登录动态 · ${snapshot.unreadCount} 条未读`:'正在读取登录动态…'}</strong><p>{error||'管理员站内提示，每 30 秒同步；关闭网页不算主动退出。'}</p></div>
    <button type="button" onClick={onOpen}>查看登录记录</button>
  </aside>;
}
