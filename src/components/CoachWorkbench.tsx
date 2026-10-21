import type { AuthUserProfile } from '../types';
import { academicAccess } from '../../shared/classDirectory.mjs';
import { AcademicCloudPanel, AcademicDataGate } from './AcademicCloudPanel';
import WeeklyRollCall from './WeeklyRollCall';
import css from './CoachWorkbench.module.css';
import CoachLogin from './CoachLogin';
import PwaInstallControl from './PwaInstallControl';
import { WORKSPACE_NAME } from '../workspaceBrand';
import { classes, coachNames } from './classRoster';
import { scheduleSlots, shanghaiDate, weekday } from './rollCallSchedule';
import { classAccess } from './classAccess';

export default function CoachWorkbench({user,onLogin,onSignIn,onManage,onSummary,onBack,onRollCall,onHome,onTraining,attendance=false,ready=true,busy=false}:{user:AuthUserProfile|null;onLogin:()=>void;onSignIn:(username:string,password:string)=>Promise<void>|void;onManage:()=>void;onSummary:()=>void;onBack:()=>void;onRollCall:()=>void;onHome:()=>void;onTraining?:()=>void;attendance?:boolean;ready?:boolean;busy?:boolean}) {
  const access=academicAccess(user);
  if(!ready)return <main className={css.workbench}><p role="status" className={css.loading}>正在验证登录状态…</p></main>;
  if(!user?.isActive)return <CoachLogin busy={busy} onSignIn={onSignIn}/>;
  if(user.mustChangePassword)return <main className={css.workbench}><h1>请先设置个人密码</h1><p>完成首次改密后才能使用工作台。</p></main>;
  const permissions=classAccess(user), date=shanghaiDate();
  const todayCourses=scheduleSlots(classes.filter(c=>permissions.all||c.coach===permissions.coach),date,'day');
  return <main className={css.workbench}>
    <header className={css.header} data-workbench-header><div><span className={css.eyebrow}>KCLUB / INTERNAL WORKSPACE</span><h1>{attendance?'快速点名':WORKSPACE_NAME}</h1>{attendance&&<p>查看本人当日课程，点班级直接展开名单。</p>}</div><div className={css.headerMember}><span className={css.memberAvatar} aria-hidden="true">{(user.displayName||user.username).slice(0,1).toUpperCase()}</span><span>{user.displayName}</span>{attendance&&<button onClick={onHome}>← 返回工作台</button>}</div></header>
    <div className={css.actions}><PwaInstallControl/><button onClick={onLogin}>当前账号 / 退出</button>{access.all&&attendance&&<button onClick={onSummary}>全班出勤汇总</button>}</div>
    {!attendance&&<>
      <div className={css.welcome}><div><h2>你好，{user.displayName}</h2><p>选择今天要处理的工作。</p></div><span>{date} · {weekday(date)}</span></div>
      <section className={css.brandHero} aria-label="机器人俱乐部主视觉"><div><span className={css.heroEyebrow}>KCLUB ROBOTICS</span><h2>专注机器人教育<br/>让每一次实践，连接成长</h2><button className={css.primary} onClick={onRollCall}>开始点名 <span aria-hidden="true">→</span></button></div><span className={css.heroCaption}>PRECISION. TEAMWORK. GROWTH.</span></section>
      <section className={css.entries} aria-label="俱乐部功能入口">
        <button type="button" className={css.entry} data-workbench-entry="attendance" aria-label="进入快速点名" onClick={onRollCall}>
          <span className={css.entryTop}><span className={css.entryCode}>01 / ATTENDANCE</span><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="5" width="20" height="24" rx="3"/><path d="M12 4h10v5H12zM11 18l4 4 9-10"/></svg></span>
          <span className={css.entryTitle}>快速点名</span><span className={css.entryDescription}>今日我的班级、队员名单、出勤记录。点班级即可开始。</span><span className={css.entryAction}>进入点名 <span aria-hidden="true">↗</span></span>
        </button>
        <button type="button" className={css.entry} aria-label="进入班级队员管理" onClick={onManage}>
          <span className={css.entryTop}><span className={css.entryCode}>02 / MEMBERS</span><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="10" r="5"/><path d="M6 28v-3a10 10 0 0 1 20 0v3M4 8a4 4 0 0 0 0 8m24-8a4 4 0 0 1 0 8"/></svg></span>
          <span className={css.entryTitle}>班级队员</span><span className={css.entryDescription}>查看负责班级和队员信息。</span><span className={css.entryAction}>管理班级 <span aria-hidden="true">↗</span></span>
        </button>
        {onTraining&&<button type="button" className={css.entry} onClick={onTraining}>
          <span className={css.entryTop}><span className={css.entryCode}>03 / TRAINING</span><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="6" width="24" height="23" rx="2"/><path d="M4 13h24M10 2v8m12-8v8M10 19h4m5 0h4m-13 5h4"/></svg></span>
          <span className={css.entryTitle}>集训安排</span><span className={css.entryDescription}>查看集训日期、时段和场地。</span><span className={css.entryAction}>查看安排 <span aria-hidden="true">↗</span></span>
        </button>}
        <button type="button" className={css.entry} onClick={onSummary}>
          <span className={css.entryTop}><span className={css.entryCode}>04 / ATTENDANCE REPORT</span><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="3" width="20" height="26" rx="2"/><path d="M11 9h10M11 15h10M11 21h6"/></svg></span>
          <span className={css.entryTitle}>出勤周报</span><span className={css.entryDescription}>{access.all?'查看全班级出勤，按周导出表格。':'查看本人班级出勤与每周汇总。'}</span><span className={css.entryAction}>查看统计 <span aria-hidden="true">↗</span></span>
        </button>
        <button type="button" className={`${css.entry} ${css.websiteEntry}`} data-workbench-entry="website" aria-label="进入完整网站" onClick={onBack}><span className={css.entryTitle}>完整网站</span><span className={css.entryDescription}>赛事管理、课程体系、面试流程与全部工作模块。</span><span className={css.entryAction}>进入网站 ↗</span></button>
      </section>
      <div className={css.homeDetails}>
        <section className={css.todayPanel}><div className={css.panelHeading}><h3>今日常规课程</h3><button onClick={onRollCall}>进入点名 →</button></div>
          {todayCourses.length?todayCourses.map(({c})=><button key={c.id} className={css.courseRow} onClick={onRollCall}><span><strong>{c.id}</strong><small>{coachNames[c.coach]}</small></span><span>{c.time}</span><span className={css.courseAction}>查看点名 →</span></button>):<div className={css.noCourses}><span aria-hidden="true">—</span><strong>今天没有常规课程</strong><p>进入快速点名，可查看本周安排或选择临时加课。</p><button onClick={onRollCall}>查看课程安排</button></div>}
          <p className={css.panelNote}>常规课表参考；放假与实际开课状态请以点名页面为准。</p>
        </section>
        <section className={css.tasksPanel}><h3>工作提醒</h3><button onClick={onRollCall}><span>课堂点名</span><small>点姓名确认到课，核对后提交。</small><b aria-hidden="true">↗</b></button><button onClick={onSummary}><span>每周出勤</span><small>已提交点名进入周报；草稿不计出勤率。</small><b aria-hidden="true">↗</b></button></section>
      </div>
    </>}
    {!attendance&&access.all&&<button type="button" className={css.reportEntry} onClick={onSummary}>出勤汇总 / 每周周报 · Lisa 可查看全部班级并导出表格</button>}
    <AcademicCloudPanel user={user}/>
    {attendance&&<AcademicDataGate accountId={user.authUserId}><WeeklyRollCall key={user.authUserId} user={user} onManageClasses={onManage} onAttendanceSummary={onSummary}/></AcademicDataGate>}
    <footer className={css.footer}>{attendance?'点班级展开名单 → 点姓名确认到课 → 核对并提交。请假在姓名旁操作。':'同一账号、同一权限。手机、平板和电脑，共用一个内部工作台。'}</footer>
  </main>;
}
