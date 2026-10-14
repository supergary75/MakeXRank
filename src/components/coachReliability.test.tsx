import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import WeeklyRollCall from './WeeklyRollCall';
import MechaWorkHub from './MechaWorkHub';
import StudentAttendance from './StudentAttendance';
import { loadRosters } from './classRoster';
import { saveAttendance, readAttendance, listAttendance, type AttendanceRow } from './attendance';
import { summarize } from './attendanceInsights';
import type { AuthUserProfile } from '../types';
const member: AttendanceRow = {id:'simulation-child',name:'模拟队员',status:'present',reason:'',detail:''};
const account=(username:string):AuthUserProfile=>({authUserId:'simulation-'+username,username,displayName:username,role:'editor',isActive:true,createdAt:'',allowedCompetitionIds:null,allowedEventTypes:null});
function isolate() {
  const data=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),key:(i:number)=>[...data.keys()][i]??null,get length(){return data.size;}});
  return data;
}
beforeEach(()=>{isolate();vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-20T01:00:00Z'));});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('模拟 Brook 周日页面只渲染其班级卡片',()=>{
  const html=renderToStaticMarkup(<WeeklyRollCall user={account('brook')} />);
  expect(html).toContain('U12B-09');expect(html).toContain('U9B-05');expect(html).toContain('U12B-08');
  expect(html).not.toContain('U18-01');expect(html).not.toContain('U12A-04');
});
it('模拟 Lisa 周日页面可见所有教练当日课程',()=>{
  const html=renderToStaticMarkup(<WeeklyRollCall user={account('lisa')} />);
  expect(html).toContain('U12B-09');expect(html).toContain('U18-01');expect(html).toContain('U12A-04');
});
it('Gary 默认只显示自己的当日课程，但保留查看全部教练入口',()=>{
  const html=renderToStaticMarkup(<WeeklyRollCall user={account('supergary')} />);
  expect(html).toContain('U18-01');expect(html).toContain('U18-02');
  expect(html).not.toContain('U12B-09');expect(html).not.toContain('U12A-04');
  expect(html).toContain('查看全部教练');
});
it('Vincent 默认本人的课，且没有全部教练切换入口',()=>{
  const html=renderToStaticMarkup(<WeeklyRollCall user={account('VincentC')} />);
  expect(html).toContain('U12A-04');expect(html).toContain('U15B-06');
  expect(html).not.toContain('U18-01');expect(html).not.toContain('查看全部教练');
});
it('周二无课时显示下一节本人的课程',()=>{
  vi.setSystemTime(new Date('2026-10-13T01:00:00Z'));
  const html=renderToStaticMarkup(<WeeklyRollCall user={account('gary')} />);
  expect(html).toContain('今天没有常规课');expect(html).toContain('2026-10-17');expect(html).toContain('U15A-03');
});
it('点名卡片读到保存的草稿后显示真实进度',()=>{
  const rows:AttendanceRow[]=[member,{...member,id:'simulation-second',name:'模拟队员乙',status:''}];
  saveAttendance('2026-09-20','U12B-09','regular',rows,'draft','brook','');
  const html=renderToStaticMarkup(<WeeklyRollCall user={account('brook')} />);
  expect(html).toContain('点名中');expect(html).toContain('已确认 1 / 2 人');
});
it('工作首页通过已登录回调显示今日点名快捷入口',()=>{
  const signedIn=renderToStaticMarkup(<MechaWorkHub action={null} onNavigate={()=>{}} onRollCall={()=>{}} />);
  const guest=renderToStaticMarkup(<MechaWorkHub action={null} onNavigate={()=>{}} />);
  expect(signedIn).toContain('进入今日点名');expect(guest).not.toContain('进入今日点名');
});
it('未登录不渲染班级卡片',()=>{
  const html=renderToStaticMarkup(<WeeklyRollCall user={null} />);expect(html).not.toContain('U12B-09');
});
it('保存后重读及统计一致',()=>{
  saveAttendance('2026-09-20','TEST','regular',[member],'submitted','brook','');
  expect(readAttendance('2026-09-20','TEST')?.rows).toEqual([member]);
  expect(summarize(listAttendance().records).arrived).toBe(1);
});
it('个人档案展示最新更正草稿而正式统计保留已提交快照',()=>{
  const saved=saveAttendance('2026-09-20','TEST','regular',[member],'submitted','brook','');
  saveAttendance('2026-09-20','TEST','regular',[{...member,status:'late',lateMinutes:20}],'draft','brook',saved.savedAt);
  expect(listAttendance(true).records[0].record.rows[0].lateMinutes).toBe(20);
  expect(listAttendance().records[0].record.rows[0].status).toBe('present');
  const html=renderToStaticMarkup(<StudentAttendance member={member} allowedIds={['TEST']} onBack={()=>{}} />);
  expect(html).toContain('迟到 20 分钟');
  expect(html).toContain('条待提交点名记录');
  expect(html).toContain('正式统计仍保留上次提交结果');
});
it('诊断：另一浏览器存储没有原设备记录',()=>{
  saveAttendance('2026-09-20','TEST','regular',[member],'submitted','brook','');
  isolate();expect(readAttendance('2026-09-20','TEST')).toBeNull();
});
it('更正草稿保留正式统计，重新提交才更新',()=>{
  const r=saveAttendance('2026-09-20','TEST','regular',[member],'submitted','brook','');
  saveAttendance('2026-09-20','TEST','regular',[{...member,status: 'late', lateMinutes: 10}],'draft','brook',r.savedAt);
  expect(summarize(listAttendance().records).expected).toBe(1);
  expect(summarize(listAttendance().records).late).toBe(0);
  const draft=readAttendance('2026-09-20','TEST')!;
  saveAttendance('2026-09-20','TEST','regular',draft.rows,'submitted','brook',draft.savedAt);
  expect(summarize(listAttendance().records).late).toBe(1);
});
it('名单损坏明确报错',()=>{
  localStorage.setItem('makexrank-class-members-v1','{broken');expect(()=>loadRosters()).toThrow();
});
it('未来课堂只允许草稿，拒绝提前提交到课',()=>{
  expect(()=>saveAttendance('2027-01-01','TEST','regular',[member],'submitted','brook','')).toThrow();
  saveAttendance('2027-01-01','TEST','regular',[{...member,status:'absent',reason:'事假'}],'draft','brook','');
  expect(readAttendance('2027-01-01','TEST')?.phase).toBe('draft');
});
it('存储失败抛出错误而不是返回保存成功',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded');}});
  expect(()=>saveAttendance('2026-09-20','TEST','regular',[member],'submitted','brook','')).toThrow('Quota exceeded');
});
