import manifestText from '../../public/manifest.webmanifest?raw';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import CoachWorkbench from './CoachWorkbench';

vi.mock('../pwaInstall',()=>({isStandalonePwa:()=>false,requestPwaInstall:async()=> 'manual',getPwaInstallInstructions:()=>[]}));
// Navigation-only render checks; the client-only cloud store has its own integration tests.
vi.mock('./AcademicCloudPanel',()=>({AcademicCloudPanel:()=>null,AcademicDataGate:({children}:{children:ReactNode})=>children}));
const props={user:null,onLogin:()=>{},onManage:()=>{},onSummary:()=>{},onBack:()=>{},onRollCall:()=>{},onHome:()=>{}};
it('opens to a club home with independent attendance and full website entries, not the attendance form',()=>{
  const html=renderToStaticMarkup(<CoachWorkbench {...props}/>);
  expect(html).toContain('俱乐部工作台');expect(html).toContain('aria-label="进入快速点名"');expect(html).toContain('aria-label="进入完整网站"');
  expect(html).not.toContain('data-roll-call-list');expect(html).not.toContain('登录后直接点名');expect(html).toContain('登录工作台');
});
it('attendance deep links show a compact screen with a return entry and a private-login gate',()=>{
  const html=renderToStaticMarkup(<CoachWorkbench {...props} attendance/>);
  expect(html).toContain('快速点名');expect(html).toContain('← 返回工作台');expect(html).toContain('登录并查看我的班级');
  expect(html).not.toContain('data-workbench-entry="website"');expect(html).not.toContain('data-roll-call-list');
});
it('the installed app starts at the two-entry club home and provides correct deep-link shortcuts',()=>{
  const manifest=JSON.parse(manifestText);
  expect(manifest.short_name).toBe('俱乐部工作台');expect(manifest.start_url).toBe('/MakeXRank/#view=coach-workbench');
  expect(manifest.shortcuts.map((s:{url:string})=>s.url)).toEqual(['/MakeXRank/#view=weekly-roll-call','/MakeXRank/#view=work-hub']);
});
