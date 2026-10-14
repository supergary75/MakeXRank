import type { classes } from './classRoster';

export type RollCallMode = 'day' | 'week' | 'extra';
type ClassSchedule = typeof classes[number];
export const shanghaiDate = (value = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
export const weekday = (date: string) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(date + 'T12:00:00Z').getUTCDay()];
export const shiftDate = (date: string, days: number) => {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
export function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date + 'T12:00:00Z')) && shiftDate(date, 0) === date;
}
export function sessionMinutes(time: string, end = false) {
  const [hours, minutes] = time.split(/[–—-]/)[end ? 1 : 0].trim().split(':').map(Number);
  return hours * 60 + minutes;
}
export function shanghaiMinutes(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value);
  return Number(parts.find(part => part.type === 'hour')?.value) * 60 + Number(parts.find(part => part.type === 'minute')?.value);
}
export function scheduleSlots(schedules: ClassSchedule[], date: string, mode: RollCallMode) {
  if (!validDate(date)) return [];
  const monday = shiftDate(date, -(new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7);
  const dates = mode === 'week' ? Array.from({ length: 7 }, (_, i) => shiftDate(monday, i)) : [date];
  return dates.flatMap(d => schedules.filter(c => mode === 'extra' || c.day === weekday(d)).map(c => ({ c, d })))
    .sort((a, b) => a.d.localeCompare(b.d) || sessionMinutes(a.c.time) - sessionMinutes(b.c.time) || a.c.id.localeCompare(b.c.id));
}
export function nextRegularClass(schedules: ClassSchedule[], from: string, holidays: string[], now = new Date()) {
  if (!validDate(from)) return null;
  for (let offset = 0; offset < 15; offset++) {
    const date = shiftDate(from, offset);
    if (holidays.includes(date)) continue;
    const slot = scheduleSlots(schedules, date, 'day').find(({ c, d }) => d !== shanghaiDate(now) || sessionMinutes(c.time, true) > shanghaiMinutes(now));
    if (slot) return slot;
  }
  return null;
}
