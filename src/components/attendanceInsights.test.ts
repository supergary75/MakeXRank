import { expect, it } from 'vitest';
import { buildAlerts, defaultRules, summarize, type Entry } from './attendanceInsights';
import type { AttendanceRow } from './attendance';
const entry=(date:string,status:AttendanceRow['status'], phase:'draft'|'submitted'='submitted', reason:AttendanceRow['reason']=''):Entry=>({date,classId:'TEST',session:'regular',record:{phase,savedAt:date,rows:[{id:'student-1',name:'测试队员',status,reason,detail:''}]}});
it('草稿不计应到或缺勤，迟到计入到课',()=>{
  const result=summarize([entry('2026-09-01','present'),entry('2026-09-02','late'),entry('2026-09-03','absent','draft','病假')]);
  expect(result.expected).toBe(2);expect(result.arrived).toBe(2);expect(result.drafts).toBe(1);expect(result.sick).toBe(0);
});
it('空数据不显示百分之百',()=>expect(summarize([]).rate).toBeNull());
it('未到待核实触发提醒但草稿不触发',()=>{
  expect(buildAlerts([entry('2026-09-01','unverified')],defaultRules)[0].title).toContain('未到待核实');
  expect(buildAlerts([entry('2026-09-01','unverified','draft')],defaultRules)).toHaveLength(0);
});
it('连续请假提醒保留原因且到课中断连续性',()=>{
  const items=[entry('2026-09-01','absent','submitted','病假'),entry('2026-09-08','absent','submitted','事假')];
  const alert=buildAlerts(items,defaultRules).find(a=>a.id.startsWith('streak:'));
  expect(alert?.detail).toContain('病假');expect(alert?.detail).toContain('事假');
  expect(buildAlerts([...items,entry('2026-09-15','present')],defaultRules).some(a=>a.id.startsWith('streak:'))).toBe(false);
});
it('迟到只检查最近四次',()=>{
  const items=[entry('2026-09-01','late'),entry('2026-09-02','late'),entry('2026-09-03','present'),entry('2026-09-04','present')];
  expect(buildAlerts(items,defaultRules).some(a=>a.id.startsWith('late:'))).toBe(true);
  expect(buildAlerts([...items,entry('2026-09-05','present')],defaultRules).some(a=>a.id.startsWith('late:'))).toBe(false);
});
it('月低出勤要满足最小课次且严格低于阈值',()=>{
  const items=[entry('2026-09-01','present'),entry('2026-09-02','absent','submitted','事假'),entry('2026-09-03','present')];
  expect(buildAlerts(items,defaultRules).some(a=>a.id.startsWith('rate:'))).toBe(false);
  expect(buildAlerts([...items,entry('2026-09-04','present')],defaultRules).some(a=>a.id.startsWith('rate:'))).toBe(false);
  expect(buildAlerts([...items,entry('2026-09-04','absent','submitted','病假')],defaultRules).some(a=>a.id.startsWith('rate:'))).toBe(true);
});
it('同一提醒刷新标识稳定',()=>{
  const items=[entry('2026-09-01','unverified')];
  expect(buildAlerts(items,defaultRules)).toEqual(buildAlerts(items,defaultRules));
});
