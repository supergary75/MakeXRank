import { academicCloudEnabled, cloudSnapshot, saveCloudHoliday } from '../services/academicCloud';
export type ClubHoliday = { date: string; note: string; active: boolean; actor: string; updatedAt: string };
const key = 'makexrank-club-holidays-v1';
export function readHolidays(): ClubHoliday[] {
  if(academicCloudEnabled)return cloudSnapshot().holidays;
  const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
  if (!Array.isArray(value) || value.some(h => !h || typeof h.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(h.date) || typeof h.note !== 'string' || typeof h.active !== 'boolean' || typeof h.actor !== 'string' || typeof h.updatedAt !== 'string')) throw new Error('放假日历读取异常，请勿覆盖。');
  return value;
}
export function isClubHoliday(date: string) { return readHolidays().some(h => h.date === date && h.active); }
export function saveHoliday(date: string, note: string, active: boolean, actor: string) {
  if(academicCloudEnabled)throw new Error('请通过云端入口修改放假安排。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) throw new Error('请选择有效日期。');
  if (active) {
    for (let i=0;i<localStorage.length;i++) if(localStorage.key(i)?.startsWith('makexrank-attendance-v1:'+date+':')) throw new Error('当天已有点名记录，不能直接设为全俱乐部放假，请先核对课程安排。');
  }
  const previous=readHolidays();
  const next=[...previous.filter(h=>h.date!==date),{date,note:note.trim(),active,actor,updatedAt:new Date().toISOString()}];
  localStorage.setItem(key,JSON.stringify(next));return next;
}
export async function persistHoliday(date:string,note:string,active:boolean,actor:string) {
  return academicCloudEnabled?saveCloudHoliday(date,note,active):saveHoliday(date,note,active,actor);
}
