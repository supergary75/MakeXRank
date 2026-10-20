import manifestText from '../../public/manifest.webmanifest?raw';
import pageHtml from '../../index.html?raw';
import iconSvg from '../../public/pwa-coach.svg?raw';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import CoachWorkbench from './CoachWorkbench';
import type { AuthUserProfile } from '../types';

vi.mock('../pwaInstall',()=>({isPwaInstalled:()=>false,canPromptPwaInstall:()=>false,getPwaInstallEnvironment:()=>({device:'desktop',wechat:false}),getPwaInstallGuide:()=>({title:'Fixture',description:'Fixture',steps:[]}),getPwaLaunchUrl:()=> 'https://fixture.test/MakeXRank/#view=coach-workbench',INSTALL_READY_EVENT:'fixture-install',requestPwaInstall:async()=> 'manual'}));
// Navigation-only render checks; the client-only cloud store has its own integration tests.
vi.mock('./AcademicCloudPanel',()=>({AcademicCloudPanel:()=>null,AcademicDataGate:({children}:{children:ReactNode})=>children}));
const user:AuthUserProfile={authUserId:'fixture-coach',username:'fixture',displayName:'Fixture Coach',role:'editor',isActive:true,createdAt:'',allowedEventTypes:null,allowedCompetitionIds:null};
const props={user:null,onLogin:()=>{},onSignIn:()=>{},onManage:()=>{},onSummary:()=>{},onBack:()=>{},onRollCall:()=>{},onHome:()=>{}};
it('guests see only the login form, not workbench entries or private data',()=>{
  const html=renderToStaticMarkup(<CoachWorkbench {...props}/>);
  expect(html).toContain('<h1>Kclub内部工作台</h1>');expect(html).toContain('aria-label="Kclub内部工作台登录"');expect(html).toContain('name="username"');expect(html.toLowerCase()).toContain('autocomplete="current-password"');expect(html).toContain('7 天');
  expect(html).not.toContain('data-workbench-entry');expect(html).not.toContain('data-roll-call-list');
});
it('attendance deep links also require login before showing any functional entry',()=>{
  const html=renderToStaticMarkup(<CoachWorkbench {...props} attendance/>);
  expect(html).toContain('<h1>Kclub内部工作台</h1>');expect(html).not.toContain('data-workbench-entry');expect(html).not.toContain('data-roll-call-list');
});
it('session restoration shows a neutral loading state, never a flash of the workbench or login form',()=>{
  const html=renderToStaticMarkup(<CoachWorkbench {...props} user={user} ready={false}/>);
  expect(html).toContain('正在验证登录状态');expect(html).not.toContain('data-workbench-entry');expect(html).not.toContain('name="password"');
});
it('an authenticated active user sees the two-entry workbench',()=>{
  const html=renderToStaticMarkup(<CoachWorkbench {...props} user={user}/>);
  expect(html).toContain('<h1>Kclub内部工作台</h1>');expect(html).toContain('aria-label="进入快速点名"');expect(html).toContain('aria-label="进入完整网站"');expect(html).not.toContain('name="password"');
  expect(renderToStaticMarkup(<CoachWorkbench {...props} user={{...user,isActive:false}}/>)).not.toContain('data-workbench-entry');
});
it('the installed app starts at the two-entry club home and provides correct deep-link shortcuts',()=>{
  const manifest=JSON.parse(manifestText);
  expect(manifest.name).toBe('Kclub内部工作台');expect(manifest.short_name).toBe('Kclub内部工作台');expect(manifest.start_url).toBe('/MakeXRank/#view=coach-workbench');
  expect(manifest.shortcuts.map((s:{url:string})=>s.url)).toEqual(['/MakeXRank/#view=weekly-roll-call','/MakeXRank/#view=work-hub']);
});
it('the browser title, Apple home-screen name and icon label use the same internal workspace name',()=>{
  expect(pageHtml).toContain('<title>Kclub内部工作台</title>');
  expect(pageHtml).toContain('name="apple-mobile-web-app-title" content="Kclub内部工作台"');
  expect(iconSvg).toContain('aria-label="Kclub内部工作台"');
});
it('a setup-only account cannot render business entries even if passed directly to the workbench',()=>{
  const html=renderToStaticMarkup(<CoachWorkbench {...props} user={{...user,mustChangePassword:true}}/>);
  expect(html).toContain('请先设置个人密码');expect(html).not.toContain('data-workbench-entry');expect(html).not.toContain('data-roll-call-list');
});
