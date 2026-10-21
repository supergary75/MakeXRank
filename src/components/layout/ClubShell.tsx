import type { ReactNode } from 'react';
import type { AuthUserProfile } from '../../types';
import css from './ClubShell.module.css';

const items = [
  ['coach-workbench','工作台','M3 11 16 2l13 9v18H19V18h-6v11H3z'],
  ['weekly-roll-call','快速点名','M8 5h18v24H6V5h2m3-3h10v6H11zM10 18l4 4 9-10'],
  ['class-member-management','班级管理','M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10M3 28v-3a9 9 0 0 1 18 0v3M23 7a5 5 0 0 1 0 9m1 4a8 8 0 0 1 5 8'],
  ['training-plan','集训安排','M4 7h24v22H4zM4 13h24M10 3v8m12-8v8M10 19h4m4 0h4m-12 5h4'],
  ['logistics','赛事后勤','M9 3h14v10a7 7 0 0 1-14 0zM9 6H3v4a7 7 0 0 0 7 6m13-10h6v4a7 7 0 0 1-7 6M16 20v8m-7 1h14'],
  ['course-documents','课程文档','M7 3h12l7 7v19H7zM19 3v8h7M12 17h9m-9 5h9'],
  ['attendance-dashboard','出勤统计','M5 28V18h5v10m4 0V10h5v18m4 0V4h5v24'],
  ['work-hub','完整网站','M3 4h26v24H3zM3 11h26M10 4v7M8 17h5v6H8zM18 18h6m-6 5h6'],
] as const;
export type ClubDestination = typeof items[number][0];
export function clubActiveDestination(view: string): ClubDestination {
  if (view.startsWith('training-')) return 'training-plan';
  if (view.startsWith('logistics')) return 'logistics';
  if (view.startsWith('curriculum-') || view === 'product-center') return 'course-documents';
  if (view === 'academic-center') return 'class-member-management';
  return items.find(([destination]) => destination === view)?.[0] ?? 'work-hub';
}
export default function ClubShell({user,view,onNavigate,children}:{user:AuthUserProfile|null;view:string;onNavigate:(view:ClubDestination)=>void;children:ReactNode}) {
  const signedIn = !!user?.isActive && !user.mustChangePassword;
  if (!signedIn) return <div className={css.guest} data-club-shell="guest">{children}</div>;
  const active = clubActiveDestination(view);
  return <div className={css.shell} data-club-shell="member">
    <aside className={css.sidebar} data-club-sidebar>
      <button className={css.brand} aria-label="Kclub内部工作台首页" onClick={() => onNavigate('coach-workbench')}><strong>KCLUB</strong><small>机器人青训俱乐部</small></button>
      <span className={css.sectionLabel}>INTERNAL WORKSPACE</span>
      <nav className={css.navigation} aria-label="内部工作台导航">{items.map(([destination,label,path]) => <button key={destination} type="button" data-club-nav={destination} aria-current={active === destination ? 'page' : undefined} onClick={() => onNavigate(destination)}><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg><span>{label}</span></button>)}</nav>
      <div className={css.sidebarBottom}><span className={css.brandRule}/><p>BUILD. COMPETE. GROW.</p><div className={css.member}><span className={css.avatar} aria-hidden="true">{(user.displayName || user.username).slice(0,1).toUpperCase()}</span><div><strong>{user.displayName || user.username}</strong><small>内部成员 · 权限保持不变</small></div></div></div>
    </aside>
    <div className={css.content}>{children}</div>
  </div>;
}
