import type { AuthUserProfile } from '../types';
import { academicAccess } from '../../shared/classDirectory.mjs';
import { AcademicCloudPanel, AcademicDataGate } from './AcademicCloudPanel';
import WeeklyRollCall from './WeeklyRollCall';
import css from './CoachWorkbench.module.css';
import CoachLogin from './CoachLogin';
import PwaInstallControl from './PwaInstallControl';
import {WORKSPACE_NAME} from '../workspaceBrand';

export default function CoachWorkbench({user,onLogin,onSignIn,onManage,onSummary,onBack,onRollCall,onHome,attendance=false,ready=true,busy=false}:{user:AuthUserProfile|null;onLogin:()=>void;onSignIn:(username:string,password:string)=>Promise<void>|void;onManage:()=>void;onSummary:()=>void;onBack:()=>void;onRollCall:()=>void;onHome:()=>void;attendance?:boolean;ready?:boolean;busy?:boolean}) {
  const access=academicAccess(user);
  if(!ready)return <main className={css.workbench}><p role="status" className={css.loading}>正在验证登录状态…</p></main>;
  if(!user?.isActive)return <CoachLogin busy={busy} onSignIn={onSignIn}/>;
  if(user.mustChangePassword)return <main className={css.workbench}><h1>请先设置个人密码</h1><p>完成首次改密后才能使用工作台。</p></main>;
  return <main className={css.workbench}>
    <header className={css.header}><div><span className={css.eyebrow}>KCLUB INTERNAL WORKSPACE</span><h1>{attendance?'快速点名':WORKSPACE_NAME}</h1><p>{attendance?'查看本人当日课程，点班级直接展开名单。':user?`${user.displayName}，请选择要使用的功能。`:'点名和完整网站，一个工作台就够了。'}</p></div>{attendance&&<button onClick={onHome}>← 返回工作台</button>}</header>
    <div className={css.actions}>
      <PwaInstallControl/>
      {user&&<button onClick={onLogin}>当前账号 / 退出</button>}
      {user&&access.all&&attendance&&<button onClick={onSummary}>全班出勤汇总</button>}
    </div>
    {!attendance&&<section className={css.entries} aria-label="俱乐部功能入口">
      <button type="button" className={css.entry} data-workbench-entry="attendance" aria-label="进入快速点名" onClick={onRollCall}>
        <span className={css.entryTop}><span className={css.entryCode}>01 / ATTENDANCE</span><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="5" width="20" height="24" rx="3"/><path d="M12 4h10v5H12zM11 18l4 4 9-10"/></svg></span>
        <span className={css.entryTitle}>快速点名</span><span className={css.entryDescription}>今日我的班级、队员名单、出勤记录。点班级即可开始。</span><span className={css.entryAction}>进入点名 <span aria-hidden="true">↗</span></span>
      </button>
      <button type="button" className={css.entry} data-workbench-entry="website" aria-label="进入完整网站" onClick={onBack}>
        <span className={css.entryTop}><span className={css.entryCode}>02 / CLUB WEBSITE</span><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="5" width="26" height="23" rx="3"/><path d="M3 12h26M10 5v7M8 17h5v6H8zM18 18h6M18 23h6"/></svg></span>
        <span className={css.entryTitle}>完整网站</span><span className={css.entryDescription}>赛事管理、集训安排、课程体系、教务管理等全部工作模块。</span><span className={css.entryAction}>进入网站 <span aria-hidden="true">↗</span></span>
      </button>
    </section>}
    {!attendance && access.all && <button type="button" className={css.reportEntry} onClick={onSummary}>出勤汇总 / 每周周报 · Lisa 可查看全部班级并导出表格</button>}
    <AcademicCloudPanel user={user}/>
    {attendance&&<AcademicDataGate accountId={user?.isActive?user.authUserId:undefined}>{user?.isActive?<WeeklyRollCall key={user.authUserId} user={user} onManageClasses={onManage} onAttendanceSummary={onSummary}/>:<section className={css.loading}><h2>登录后直接点名</h2><p>系统按教练账号匹配班级，默认显示今天的课程；没有课时可查看本周安排。</p></section>}</AcademicDataGate>}
    <footer className={css.footer}>{attendance?'点班级展开名单 → 点姓名确认到课 → 核对并提交。请假在姓名旁操作。':'两个入口共用同一账号和权限，手机、平板和电脑都能打开。添加到手机桌面后，直接进入这个工作台。'}</footer>
  </main>;
}
