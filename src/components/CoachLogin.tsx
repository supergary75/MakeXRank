import type { FormEvent } from 'react';
import css from './CoachWorkbench.module.css';
import PwaInstallControl from './PwaInstallControl';
import {WORKSPACE_NAME} from '../workspaceBrand';

export default function CoachLogin({busy,onSignIn}:{busy:boolean;onSignIn:(username:string,password:string)=>Promise<void>|void}) {
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    void onSignIn(String(data.get('username')||''),String(data.get('password')||''));
  };
  return <main className={`${css.workbench} ${css.login}`}>
    <header className={css.header}><div><span className={css.eyebrow}>KCLUB INTERNAL WORKSPACE</span><h1>{WORKSPACE_NAME}</h1><p>使用内部账号登录，进入点名和完整网站。</p></div></header>
    <form className={css.loginForm} aria-label={`${WORKSPACE_NAME}登录`} onSubmit={submit}>
      <label>登录名<input name="username" placeholder="例如：kclub-vincent" autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={busy}/></label>
      <label>密码<input name="password" type="password" autoComplete="current-password" required disabled={busy}/></label>
      <button className={css.primary} type="submit" disabled={busy}>{busy?'正在登录…':'登录并进入工作台'}</button>
      <p className={css.footer}>首次使用初始密码验证身份，随后必须设置个人密码；以后使用个人密码登录。</p>
      <p className={css.footer}>本浏览器登录后 7 天内免重复登录，到期后重新验证。主动退出、账号停用或重置密码后立即失效。</p>
      <p className={css.footer}>仅在本人设备上使用；无痕模式、清除网站数据或更换浏览器需要重新登录。</p>
    </form>
    <PwaInstallControl/>
  </main>;
}
