import { academicAccess, classes } from '../shared/classDirectory.mjs';
export function fail(status, message) { throw Object.assign(new Error(message), {status}); }
export const todayShanghai = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date+'T00:00:00Z')) && new Date(date+'T00:00:00Z').toISOString().slice(0,10) === date;
}
export function allowedClasses(actor) {
  const access = academicAccess(actor);
  return classes.filter(c => access.all || c.coach === access.coach).map(c=>c.id);
}
export function requireClass(actor, id, write = false) {
  if (!allowedClasses(actor).includes(id) || (write && !academicAccess(actor).write)) fail(403,'没有这个班级的访问或编辑权限。');
}
export function revision(value, expected) {
  if (!Number.isInteger(value) || value < 0) fail(400,'缺少有效版本号。');
  if (value !== expected) fail(409,'其他设备已更新此记录。请保留本次内容，重新加载后核对，不会覆盖他人的修改。');
}
export function members(value, attendance = false) {
  if (!Array.isArray(value) || value.length > 150) fail(400,'班级名单格式不正确或人数过多。');
  const ids = new Set();
  return value.map(m => {
    if (!m || typeof m.id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(m.id) || ids.has(m.id) || typeof m.name !== 'string' || !m.name.trim() || m.name.length > 80) fail(400,'队员姓名或 ID 不正确、重复，请先核对真实名册。');
    ids.add(m.id);
    const row = {id:m.id, name:m.name.trim()};
    if (!attendance) return row;
    if (!['','present','late','unverified','absent'].includes(m.status) || !['','病假','事假','自定义'].includes(m.reason) || typeof m.detail !== 'string' || m.detail.length > 200) fail(400,'点名状态或原因不正确。');
    if (m.lateMinutes !== undefined && (!Number.isInteger(m.lateMinutes) || m.lateMinutes < 10 || m.lateMinutes > 180 || m.lateMinutes % 10)) fail(400,'迟到时长必须为 10 分钟一档。');
    return {...row,status:m.status,reason:m.reason,detail:m.detail,...(m.temporary === true ? {temporary:true}:{}),...(m.lateMinutes !== undefined ? {lateMinutes:m.lateMinutes}:{})};
  });
}
export function validateSubmission(rows, date) {
  if (date > todayShanghai()) fail(400,'未来课程不能提前提交实际出勤。');
  if (!rows.length || rows.some(r => !r.status)) fail(400,'请逐一完成点名后提交。');
  if (rows.some(r=>r.status==='late' && !r.lateMinutes)) fail(400,'请补全迟到时长。');
  if (rows.some(r=>r.status==='absent' && (!r.reason || (r.reason==='自定义' && !r.detail.trim())))) fail(400,'请补全缺勤原因。');
}
export function attendanceRecord(previous, input, actor, date) {
  if (!['draft','submitted'].includes(input.phase)) fail(400,'点名阶段不正确。');
  const rows = members(input.rows, true);
  if (input.phase === 'submitted') validateSubmission(rows,date);
  const stamp = new Date(Math.max(Date.now(), Date.parse(previous?.savedAt) + 1 || 0)).toISOString();
  return {rows, savedAt:stamp, phase:input.phase,
    ...(input.phase === 'submitted' ? {submittedRows:rows,submittedAt:stamp} : previous?.submittedRows ? {submittedRows:previous.submittedRows,submittedAt:previous.submittedAt} : previous?.phase==='submitted' ? {submittedRows:previous.rows,submittedAt:previous.savedAt} : {}),
    audit:[...(previous?.audit ?? []),{at:stamp,actor:actor.username,action:input.phase==='submitted'?'提交点名':'保存草稿',changes:rows.filter(r=>JSON.stringify(r)!==JSON.stringify(previous?.rows.find(p=>p.id===r.id))).map(r=>`${r.name}：${r.status || '待确认'}${r.reason?' · '+r.reason:''}`)}],
  };
}
export function importedRecord(input, actor, date) {
  if (!input || typeof input.savedAt!=='string' || !Number.isFinite(Date.parse(input.savedAt)) || (input.phase && !['draft','submitted'].includes(input.phase))) fail(400,'历史点名记录格式损坏，未导入。');
  const phase = input.phase ?? 'submitted';
  const rows = members(input.rows,true);
  if (phase==='submitted') validateSubmission(rows,date);
  let submittedRows, submittedAt;
  if (input.submittedRows) {
    submittedRows=members(input.submittedRows,true);validateSubmission(submittedRows,date);
    if(typeof input.submittedAt!=='string'||!Number.isFinite(Date.parse(input.submittedAt)))fail(400,'正式点名时间损坏，未导入。');
    submittedAt=input.submittedAt;
  }
  if(input.audit!==undefined&&!Array.isArray(input.audit))fail(400,'历史修改记录损坏，未导入。');
  const audit = input.audit ?? [];
  if(audit.length>20000 || audit.some(a=>!a || typeof a.actor!=='string' || typeof a.action!=='string' || !Number.isFinite(Date.parse(a.at)) || !Array.isArray(a.changes) || a.changes.some(c=>typeof c!=='string')))fail(400,'历史修改记录损坏，未导入。');
  return {rows,phase,savedAt:input.savedAt,...(submittedRows?{submittedRows,submittedAt}:{}),audit:[...audit,{at:new Date().toISOString(),actor:actor.username,action:'从本地备份迁入云端',changes:[]}]};
}
