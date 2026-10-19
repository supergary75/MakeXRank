import type { Member } from './classRoster';
import { isClubHoliday } from './clubHolidays';
import { academicCloudEnabled, cloudSnapshot, saveCloudAttendance } from '../services/academicCloud';
export type AttendanceRow = Member & { status: '' | 'present' | 'late' | 'unverified' | 'absent'; reason: '' | '病假' | '事假' | '自定义'; detail: string; temporary?: boolean; lateMinutes?: number };
export type Audit = { at: string; actor: string; action: string; changes: string[] };
export type AttendanceRecord = { rows: AttendanceRow[]; savedAt: string; phase?: 'draft' | 'submitted'; audit?: Audit[]; submittedRows?: AttendanceRow[]; submittedAt?: string; hasDraft?: boolean };
export const attendanceKey = (date: string, classId: string, session = 'regular') => `makexrank-attendance-v1:${date}:${classId}${session === 'regular' ? '' : `:${session}`}`;
export const statusLabel = (row: AttendanceRow) => row.status === 'present' ? '已到' : row.status === 'late' ? (row.lateMinutes ? `迟到 ${row.lateMinutes} 分钟` : '迟到（时长未记录）') : row.status === 'unverified' ? '未到·待核实' : row.status === 'absent' ? row.reason || '缺勤原因待填' : '待确认';
export function attendanceError(rows: AttendanceRow[]): string {
  if (!rows.length) return '本班暂无队员，请先在班级队员管理中录入。';
  if (rows.some(row => !row.name.trim())) return '请先补全队员姓名，再进行点名。';
  if (rows.some(row => !row.status)) return '还有队员未点名，请逐一确认。';
  if (rows.some(row => row.status === 'late' && (!Number.isInteger(row.lateMinutes) || !row.lateMinutes || row.lateMinutes < 10 || row.lateMinutes > 180 || row.lateMinutes % 10 !== 0))) return '请选择迟到时长（10 分钟一档）。';
  if (rows.some(row => row.status === 'absent' && (!row.reason || (row.reason === '自定义' && !row.detail.trim())))) return '请补全缺勤原因。';
  return '';
}
export function readAttendance(date: string, classId: string, session = 'regular'): AttendanceRecord | null {
  if(academicCloudEnabled)return cloudSnapshot().attendance.find(e=>e.class_id===classId&&e.date===date&&e.session===session)?.record ?? null;
  const raw = localStorage.getItem(attendanceKey(date, classId, session));
  if (!raw) return null;
  const data = JSON.parse(raw) as AttendanceRecord;
  if (!data || !Array.isArray(data.rows) || typeof data.savedAt !== 'string' || data.rows.some(row => !row || typeof row.id !== 'string' || typeof row.name !== 'string' || !['', 'present', 'late', 'unverified', 'absent'].includes(row.status) || !['', '病假', '事假', '自定义'].includes(row.reason) || typeof row.detail !== 'string') || (data.phase && !['draft', 'submitted'].includes(data.phase)) || (data.audit && (!Array.isArray(data.audit) || data.audit.some(entry => !entry || typeof entry.at !== 'string' || typeof entry.actor !== 'string' || typeof entry.action !== 'string' || !Array.isArray(entry.changes))))) throw new Error('点名记录无法读取，请勿覆盖原记录。');
  if (data.submittedRows && (!Array.isArray(data.submittedRows) || data.submittedRows.some(row => !row || typeof row.id !== 'string' || typeof row.name !== 'string' || !['present','late','unverified','absent'].includes(row.status) || !['','病假','事假','自定义'].includes(row.reason) || typeof row.detail !== 'string') || typeof data.submittedAt !== 'string')) throw new Error('正式点名快照损坏，请勿覆盖原记录。');
  return { ...data, phase: data.phase ?? 'submitted', audit: data.audit ?? [] };
}

export function saveAttendance(date: string, classId: string, session: string, rows: AttendanceRow[], phase: 'draft' | 'submitted', actor: string, expected: string): AttendanceRecord {
  if(academicCloudEnabled)throw new Error('请通过云端保存入口提交点名。');
  if (isClubHoliday(date)) throw new Error('当天已登记俱乐部放假，不记录应到或缺勤；如恢复上课，请管理员先取消放假。');
  const previous = readAttendance(date, classId, session);
  if ((previous?.savedAt ?? '') !== expected) throw new Error('另一页面已更新此记录，请重新进入班级加载最新内容。');
  if (phase === 'submitted') {
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) throw new Error('未来课程只能登记草稿或请假，不能提前提交实际出勤。');
    const error = attendanceError(rows); if (error) throw new Error(error);
  }
  const stamp = new Date(Math.max(Date.now(), Date.parse(expected) + 1 || 0)).toISOString();
  const changes = rows.filter(row => JSON.stringify(previous?.rows.find(old => old.id === row.id)) !== JSON.stringify(row)).map(row => {
    const old = previous?.rows.find(entry => entry.id === row.id);
    return `${row.name || '待补录'}：${old ? statusLabel(old) + (old.detail ? `（${old.detail}）` : '') : '新增至课次'} → ${statusLabel(row)}${row.detail ? `（${row.detail}）` : ''}`;
  });
  const submittedRows = phase === 'submitted' ? rows : previous?.submittedRows ?? (previous?.phase === 'submitted' ? previous.rows : undefined);
  changes.push(...(previous?.rows ?? []).filter(old => !rows.some(row=>row.id===old.id)).map(old=>`${old.name}：移出本次课`));
  const submittedAt = phase === 'submitted' ? stamp : previous?.submittedAt ?? (previous?.phase === 'submitted' ? previous.savedAt : undefined);
  const record: AttendanceRecord = { rows, savedAt: stamp, phase, submittedRows, submittedAt, audit: [...previous?.audit ?? [], { at: stamp, actor, action: phase === 'submitted' ? '提交点名' : '保存草稿', changes }] };
  localStorage.setItem(attendanceKey(date, classId, session), JSON.stringify(record));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('attendance-updated'));
  return record;
}

export function listAttendance(latest = false) {
  const records: { date: string; classId: string; session: string; record: AttendanceRecord }[] = [];
  if(academicCloudEnabled)return {records:cloudSnapshot().attendance.map(e=>({date:e.date,classId:e.class_id,session:e.session,record:!latest&&e.record.phase==='draft'&&e.record.submittedRows?{...e.record,rows:e.record.submittedRows,savedAt:e.record.submittedAt||e.record.savedAt,phase:'submitted' as const,hasDraft:true}:e.record})),errors:0};
  let errors = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) || '';
    if (!key.startsWith('makexrank-attendance-v1:')) continue;
    const [, date, classId, session = 'regular'] = key.split(':');
    try {
      const record = readAttendance(date, classId, session);
      if (record) records.push({ date, classId, session, record: !latest && record.phase === 'draft' && record.submittedRows ? { ...record, rows: record.submittedRows, savedAt: record.submittedAt || record.savedAt, phase: 'submitted', hasDraft: true } : record });
    } catch { errors++; }
  }
  return { records, errors };
}

export async function persistAttendance(date:string,classId:string,session:string,rows:AttendanceRow[],phase:'draft'|'submitted',actor:string,expected:string):Promise<AttendanceRecord> {
  return academicCloudEnabled?saveCloudAttendance(date,classId,session,rows,phase,expected):saveAttendance(date,classId,session,rows,phase,actor,expected);
}
