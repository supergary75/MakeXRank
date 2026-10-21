import { expect,it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ClubShell,{clubActiveDestination} from './ClubShell';
import type {AuthUserProfile} from '../../types';
const user:AuthUserProfile={authUserId:'design-test-only',username:'kclub-brook',displayName:'Brook',role:'editor',isActive:true,createdAt:'',allowedCompetitionIds:null,allowedEventTypes:null};
const render=(profile:AuthUserProfile|null,view='coach-workbench')=>renderToStaticMarkup(<ClubShell user={profile} view={view} onNavigate={()=>{}}><p>Existing module</p></ClubShell>);
it('统一导航只显示给完成登录的启用账号，不绕过首次改密',()=>{
  expect(render(null)).not.toContain('data-club-sidebar');
  expect(render({...user,isActive:false})).not.toContain('data-club-sidebar');
  expect(render({...user,mustChangePassword:true})).not.toContain('data-club-sidebar');
  const html=render(user);
  expect(html).toContain('内部工作台导航');expect(html).toContain('Existing module');expect(html).toContain('Brook');
  expect((html.match(/aria-current="page"/g)||[]).length).toBe(1);
});
it('子页面选中正确工作模块，保留已有路由名称',()=>{
  expect(clubActiveDestination('training-event')).toBe('training-plan');
  expect(clubActiveDestination('logistics-event-roster')).toBe('logistics');
  expect(clubActiveDestination('curriculum-u9')).toBe('course-documents');
  expect(clubActiveDestination('attendance-dashboard')).toBe('attendance-dashboard');
  expect(render(user,'weekly-roll-call')).toContain('data-club-nav="weekly-roll-call" aria-current="page"');
});
