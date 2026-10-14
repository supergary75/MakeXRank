import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { saveAttendance, readAttendance, listAttendance, type AttendanceRow } from './attendance';
import { summarize } from './attendanceInsights';
import StudentAttendance from './StudentAttendance';
import { classAccess } from './classAccess';
import type { AuthUserProfile } from '../types';

afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('诊断：现有真实登录名未命中班级权限映射',()=>{
  for(const username of ['brooky','lisaw','vincentc','jasonz']) {
    const user={username,isActive:true,role:'admin'} as AuthUserProfile;
    expect(classAccess(user)).toEqual({all:false,coach:null});
  }
});
it('完整模拟课堂：预登记、签到取消、迟到、提交、档案与更正',()=>{
  const storage=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),key:(i:number)=>[...storage.keys()][i]??null,get length(){return storage.size;}});
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-19T01:00:00Z'));
  const rows:AttendanceRow[]=Array.from({length:4},(_,i)=>({id:`sim-${i}`,name:`模拟队员${i+1}`,status:'',reason:'',detail:''}));
  rows[3]={...rows[3],status:'absent',reason:'病假'};
  let saved=saveAttendance('2026-09-20','SIM','regular',rows,'draft','brook','');
  expect(readAttendance('2026-09-20','SIM')?.rows[3].reason).toBe('病假');
  vi.setSystemTime(new Date('2026-09-20T02:00:00Z'));
  const change=(index:number,patch:Partial<AttendanceRow>)=>{rows[index]={...rows[index],...patch};saved=saveAttendance('2026-09-20','SIM','regular',rows,'draft','brook',saved.savedAt);};
  change(0,{status:'present'});change(0,{status:''});
  expect(readAttendance('2026-09-20','SIM')?.rows[0].status).toBe('');
  change(0,{status:'present'});change(1,{status:'present'});
  expect(()=>saveAttendance('2026-09-20','SIM','regular',rows,'submitted','brook',saved.savedAt)).toThrow('还有队员未点名');
  change(2,{status:'late'});
  expect(()=>saveAttendance('2026-09-20','SIM','regular',rows,'submitted','brook',saved.savedAt)).toThrow('迟到时长');
  change(2,{lateMinutes:20});
  expect(summarize(listAttendance().records).arrived).toBe(0);
  saved=saveAttendance('2026-09-20','SIM','regular',rows,'submitted','brook',saved.savedAt);
  expect(summarize(listAttendance().records)).toMatchObject({lessons:1,expected:4,arrived:3,late:1,sick:1,rate:75});
  for(const row of rows){
    const html=renderToStaticMarkup(<StudentAttendance member={row} allowedIds={['SIM']} onBack={()=>{}} />);
    expect(html).toContain('最新签到记录');expect(html).toContain('已提交 · 已计入');
  }
  const stale=saved.savedAt;
  change(2,{lateMinutes:30});
  expect(()=>saveAttendance('2026-09-20','SIM','regular',rows,'draft','brook',stale)).toThrow('另一页面已更新');
  expect(listAttendance().records[0].record.rows[2].lateMinutes).toBe(20);
  expect(listAttendance(true).records[0].record.rows[2].lateMinutes).toBe(30);
  saveAttendance('2026-09-20','SIM','regular',rows,'submitted','brook',saved.savedAt);
  expect(listAttendance().records[0].record.rows[2].lateMinutes).toBe(30);
});
