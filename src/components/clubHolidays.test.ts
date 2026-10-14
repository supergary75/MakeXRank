import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { saveHoliday, isClubHoliday } from './clubHolidays';
import { saveAttendance } from './attendance';
import { monthCells } from './StudentAttendanceCalendar';
beforeEach(()=>{const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),key:(i:number)=>[...data.keys()][i]??null,get length(){return data.size;}});});
afterEach(()=>vi.unstubAllGlobals());
it('月历正确处理闰月和周一开头偏移',()=>{
 expect(monthCells('2024-02').filter(Boolean)).toHaveLength(29);
 expect(monthCells('2026-09')[0]).toBe('');
 expect(monthCells('2026-09')[1]).toBe('2026-09-01');
});
it('放假日阻止点名，取消后恢复',()=>{
 saveHoliday('2026-10-01','统一休息',true,'supergary');expect(isClubHoliday('2026-10-01')).toBe(true);
 expect(()=>saveAttendance('2026-10-01','TEST','regular',[],'draft','brook','')).toThrow('放假');
 saveHoliday('2026-10-01','',false,'supergary');expect(isClubHoliday('2026-10-01')).toBe(false);
});
it('已有课次不允许改成全俱乐部放假',()=>{
 saveAttendance('2026-10-01','TEST','regular',[],'draft','brook','');
 expect(()=>saveHoliday('2026-10-01','',true,'supergary')).toThrow('已有点名');
});
it('非法日期不写入',()=>expect(()=>saveHoliday('2026-02-30','',true,'supergary')).toThrow('有效日期'));
