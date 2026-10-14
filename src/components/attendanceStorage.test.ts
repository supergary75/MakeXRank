import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { attendanceKey, listAttendance, readAttendance, saveAttendance, type AttendanceRow } from './attendance';
const row: AttendanceRow = { id: 'stable-student-id', name: '测试队员', status: '', reason: '', detail: '' };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-20T01:00:00Z'));
  const data = new Map<string,string>();
  vi.stubGlobal('localStorage', { getItem: (k:string)=>data.get(k) ?? null, setItem:(k:string,v:string)=>data.set(k,v), key:(i:number)=>[...data.keys()][i] ?? null, get length(){return data.size;} });
});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('草稿允许未确认，提交拒绝未确认', ()=>{
  const r = saveAttendance('2026-09-19','U15A-03','regular',[row],'draft','gary','');
  expect(readAttendance('2026-09-19','U15A-03')?.phase).toBe('draft');
  expect(()=>saveAttendance('2026-09-19','U15A-03','regular',[row],'submitted','gary',r.savedAt)).toThrow();
});
it('提交和更正留痕并保留稳定队员 ID', ()=>{
  const r = saveAttendance('2026-09-19','U15A-03','regular',[{...row,status:'present'}],'submitted','gary','');
  const updated = saveAttendance('2026-09-19','U15A-03','regular',[{...row,status: 'late', lateMinutes: 10}],'draft','lisa',r.savedAt);
  expect(updated.audit).toHaveLength(2);
  expect(updated.audit?.[1].actor).toBe('lisa');
  expect(updated.rows[0].id).toBe(row.id);
  expect(updated.phase).toBe('draft');
});
it('防止旧标签覆盖新记录', ()=>{
  saveAttendance('2026-09-19','U15A-03','regular',[row],'draft','gary','');
  expect(()=>saveAttendance('2026-09-19','U15A-03','regular',[row],'draft','gary','')).toThrow();
});
it('常规课与加课互不覆盖，历史列表保留两份记录', ()=>{
  saveAttendance('2026-09-19','U15A-03','regular',[row],'draft','gary','');
  saveAttendance('2026-09-19','U15A-03','extra1',[{...row,status: 'late', lateMinutes: 10}],'submitted','gary','');
  expect(listAttendance().records).toHaveLength(2);
  expect(readAttendance('2026-09-19','U15A-03')?.rows[0].status).toBe('');
});
it('兼容旧版保存记录为已提交且不删除', ()=>{
  localStorage.setItem(attendanceKey('2026-09-19','U15A-03'), JSON.stringify({rows:[{...row,status:'present'}],savedAt:'2026-09-19T00:00:00Z'}));
  expect(readAttendance('2026-09-19','U15A-03')?.phase).toBe('submitted');
});
it('坏记录显式报告，不覆盖', ()=>{
  localStorage.setItem(attendanceKey('2026-09-19','U15A-03'),'{');
  expect(listAttendance().errors).toBe(1);
  expect(()=>saveAttendance('2026-09-19','U15A-03','regular',[row],'draft','gary','')).toThrow();
});
