import {useState} from 'react';
import type {FormEvent} from 'react';
import {WORKSPACE_NAME} from '../workspaceBrand';
import css from './CoachWorkbench.module.css';

export default function InitialPasswordSetup({username,busy,onSave,onLogout}:{username:string;busy:boolean;onSave:(password:string)=>Promise<void>;onLogout:()=>void}) {
  const [error,setError]=useState('');
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=event.currentTarget,data=new FormData(form);
    const password=String(data.get('newPassword')||''),confirm=String(data.get('confirmPassword')||'');
    if(password!==confirm){setError('两次输入的密码不一致，请重新核对。');return;}
    if(password.length<15||password.length>128){setError('个人密码需要 15–128 位，可以使用容易记住的长短语。');return;}
    setError('');
    try {await onSave(password);form.reset();}
    catch(reason){setError(reason instanceof Error?reason.message:'设置未完成，请重试。');}
  };
  return <main className={`${css.workbench} ${css.login}`}>
    <header className={css.header}><div><span className={css.eyebrow}>KCLUB INTERNAL WORKSPACE</span><h1>设置个人密码</h1><p>{WORKSPACE_NAME} · 首次登录</p></div></header>
    <p>登录账号：<strong>{username}</strong></p>
    <p>身份已验证。请先设置只有本人知道的密码，完成后才能进入工作台。此次设置验证有效期为 10 分钟。</p>
    <form className={css.loginForm} aria-label="首次设置个人密码" onSubmit={event=>void submit(event)}>
      <label>新密码<input type="password" name="newPassword" autoComplete="new-password" minLength={15} maxLength={128} required disabled={busy}/></label>
      <label>再次输入新密码<input type="password" name="confirmPassword" autoComplete="new-password" minLength={15} maxLength={128} required disabled={busy}/></label>
      <p className={css.footer}>15–128 位，支持空格和长短语。不能重复使用初始密码，请勿将个人密码转发给他人。</p>
      {error&&<p role="alert">{error}</p>}
      <button type="submit" className={css.primary} disabled={busy}>{busy?'正在设置…':'确认新密码并进入工作台'}</button>
    </form>
    <button type="button" onClick={onLogout} disabled={busy}>退出，稍后设置</button>
  </main>;
}
