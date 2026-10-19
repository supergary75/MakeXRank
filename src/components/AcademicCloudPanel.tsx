import { useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AuthUserProfile } from '../types';
import { academicCloudEnabled, getAcademicState, localAcademicMigration, migrateAcademic, parseAcademicMigration, refreshAcademic, subscribeAcademic, unsavedAcademicChanges } from '../services/academicCloud';
import css from './CoachWorkbench.module.css';

export function AcademicCloudPanel({user}:{user:AuthUserProfile|null}) {
  const state=useSyncExternalStore(subscribeAcademic,getAcademicState);
  const [preview,setPreview]=useState<ReturnType<typeof localAcademicMigration>|null>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const cloud=academicCloudEnabled;
  let unsavedCount=0;try{unsavedCount=Object.keys(unsavedAcademicChanges()).length;}catch{/* do not clear unreadable backup */}
  const title=!cloud?'本地预览 · 数据仍只在此浏览器':state.pending?'正在保存到腾讯云…':state.phase==='ready'?'已连接腾讯云教务数据库':state.phase==='loading'?'正在加载云端班级与出勤…':state.phase==='signed-out'?'登录后加载本人班级':'连接中断 · 暂停保存';
  const download=()=>{
    try{
      const payload=preview ?? localAcademicMigration();
      const url=URL.createObjectURL(new Blob([JSON.stringify({format:'makexrank-academic-backup-v1',...payload},null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=`教务本地备份-${new Date().toISOString().slice(0,10)}.json`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){setMessage(String(error));}
  };
  const downloadUnsaved=()=>{
    try{const url=URL.createObjectURL(new Blob([JSON.stringify(unsavedAcademicChanges(),null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='教务未同步修改备份.json';link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){setMessage(String(error));}
  };
  if(cloud&&state.account!==(user?.isActive?user.authUserId:''))return <section className={css.syncPanel} role="status">正在切换账号，重新加载本人班级…</section>;
  return <section className={css.syncPanel} aria-label="教务数据同步状态">
    <div className={css.syncHeading}><strong role="status">{title}</strong>{cloud&&user&&<button type="button" disabled={!!state.pending||busy} onClick={()=>void refreshAcademic()}>重新同步</button>}</div>
    {state.message&&<p role="alert">{state.message}</p>}
    {unsavedCount>0&&<div><p>本机保留 {unsavedCount} 份曾保存失败的修改，请下载并核对；它们不会自动覆盖云端。</p><button onClick={downloadUnsaved}>下载未保存修改备份</button></div>}
    {cloud&&state.phase==='error'&&state.snapshot&&<p>当前展示本账号上次缓存，仅供查看。请重连后再点名或修改名单。</p>}
    {cloud&&state.updatedAt&&<small>最近同步 {new Date(state.updatedAt).toLocaleTimeString('zh-CN')} · 只有服务器确认后才显示保存成功</small>}
    {(state.snapshot?.permissions.all || (!cloud&&['supergary','gary','lisa','lisaw'].includes(user?.username.toLowerCase() || '')))&&<details>
      <summary>迁移本机原有真实数据 / 下载备份</summary>
      <p>本地原名单不会自动上传或清空。先核对备份，再添加到腾讯云；云端已有的同班名单、同课次记录会跳过，不覆盖。</p>
      <div className={css.actions}><button disabled={busy} onClick={()=>{try{setPreview(localAcademicMigration());setMessage('请核对以下数量，并下载备份。');}catch(error){setMessage(String(error));}}}>读取本机原数据预览</button><button disabled={busy} onClick={download}>下载本机完整教务备份</button></div>
      <label>读取之前下载的教务 / 名册 JSON 备份 <input type="file" accept=".json" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{setPreview(parseAcademicMigration(await file.text()));setMessage('备份已读取，仅预览，尚未上传。');}catch(error){setMessage('读取失败：'+String(error));}}}/></label>
      {preview&&<div>
        <p>本机原数据：{Object.keys(preview.rosters).length} 个班级、{Object.values(preview.rosters).reduce((n,r)=>n+r.length,0)} 名队员、{preview.attendance.length} 条点名、{preview.holidays.length} 条放假安排。</p>
        <p>{Object.entries(preview.rosters).map(([id,rows])=>`${id}（${rows.length} 人）`).join(' · ') || '本机没有旧名单；请在保存原名单的浏览器进行迁移。'}</p>
        <button disabled={!cloud||state.phase!=='ready'||busy||!state.snapshot?.permissions.write||!!state.pending} onClick={async()=>{
          if(!window.confirm('将预览中的真实班级名单、历史点名和放假安排添加到你的腾讯云教务数据库？云端已有记录不会被覆盖，本机原数据也会保留。'))return;
          setBusy(true);setMessage('正在迁移，请勿关闭页面…');
          try{const r=await migrateAcademic(preview);setMessage(`迁移完成：新增 ${r.rosters} 个班级、${r.attendance} 条点名、${r.holidays} 条放假。跳过 ${r.skipped.length} 条云端已有记录。`);setPreview(null);}catch(error){setMessage('迁移未完成：'+String(error)+'。本机数据保留，请核对后重试。');}finally{setBusy(false);}
        }}>确认添加到腾讯云（不覆盖已有记录）</button>
        {!cloud&&<p>当前为本地预览，迁移按钮暂不可用；正式连接腾讯云后才能上传。</p>}
      </div>}
    </details>}
    {message&&<p role="status">{message}</p>}
  </section>;
}

export function AcademicDataGate({children,accountId}:{children:ReactNode;accountId?:string}) {
  const state=useSyncExternalStore(subscribeAcademic,getAcademicState);
  if(academicCloudEnabled&&(!state.snapshot||state.account!==accountId))return <div className={css.loading}><p>{state.phase==='signed-out'?'请先登录，系统将自动载入本人班级。':state.phase==='error'?'教务数据库尚未连接。请查看上方连接提示，原本地名单未被覆盖。':'正在读取真实名单，请稍候…'}</p></div>;
  return children;
}
