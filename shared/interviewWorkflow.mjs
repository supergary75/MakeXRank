export const STAGES = {
  pending_coach: '待教练响应', pending_lisa: '待发起人确认', confirmed: '已确认待面试',
  in_progress: '面试中', report_draft: '待完成报告', report_finalized: 'PDF 生成中',
  pdf_ready: '待交付', delivered: '已交付待归档', cancelled: '已取消待归档',
  no_show: '未到场待归档', archived: '已归档',
};
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function text(value, name, max = 2000, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(`${name}格式不正确`);
  return value.trim();
}
function future(value, now) {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)) || Date.parse(value) <= Date.parse(now)) fail('请选择未来的面试时间（含时区）');
  return new Date(value).toISOString();
}
export function canRead(record, actor) { return !!actor && (record.managerId === actor.id || record.coachId === actor.id); }
export function createInterview(input, actor, coaches, now = new Date().toISOString()) {
  if (!actor.canInitiate) fail('当前账号没有面试发起权限', 403);
  if (!coaches.some(c => c.id === input.coachId && c.role === 'coach')) fail('请选择已绑定的教练账号');
  if (!/^[0-9a-f-]{36}$/i.test(input.id || '')) fail('面试编号无效');
  const record = {
    id: input.id, managerId: actor.id, coachId: input.coachId,
    studentName: text(input.studentName, '学员姓名', 80, true),
    grade: text(input.grade, '年龄/年级', 80, true), course: text(input.course, '意向课程', 120, true),
    experience: text(input.experience || '', '学习经历'), notes: text(input.notes || '', '备注'),
    location: text(input.location || '', '面试地点', 200),
    scheduledAt: future(input.scheduledAt, now), timezone: 'Asia/Shanghai',
    status: 'pending_coach', version: 1, scheduleVersion: 1, proposedAt: null,
    templateStatus: 'template_pending', report: '', reportVersion: 0,
    createdAt: now, updatedAt: now, archivedAt: null, history: [],
  };
  record.history.push({ at: now, actorId: actor.id, action: 'create', label: '发起面试', scheduledAt: record.scheduledAt });
  return record;
}
export function transitionInterview(record, actor, input, now = new Date().toISOString()) {
  if (!canRead(record, actor)) fail('无权操作此面试', 403);
  if (!Number.isInteger(input.version) || input.version !== record.version) fail('记录已更新，请刷新后重试', 409);
  if (record.status === 'archived') fail('已归档记录不可修改', 409);
  const next = structuredClone(record);
  const manager = actor.canInitiate && actor.id === record.managerId;
  const coach = actor.role === 'coach' && actor.id === record.coachId;
  const check = (allowed, stages) => {
    if (!allowed) fail('当前账号无权执行此操作', 403);
    if (!stages.includes(record.status)) fail('当前阶段不能执行此操作', 409);
  };
  let label;
  switch (input.action) {
    case 'accept':
      check(coach, ['pending_coach']);
      future(record.scheduledAt, now);
      next.status = 'confirmed'; label = '教练接受邀请'; break;
    case 'propose':
      check(coach, ['pending_coach', 'confirmed']);
      next.proposedAt = future(input.scheduledAt, now);
      next.status = 'pending_lisa'; next.scheduleVersion++; label = '教练提议改期'; break;
    case 'confirm_time':
      check(manager, ['pending_lisa']);
      next.scheduledAt = future(record.proposedAt, now); next.proposedAt = null;
      next.scheduleVersion++; next.status = 'confirmed'; label = '发起人确认改期'; break;
    case 'counter_time':
      check(manager, ['pending_lisa', 'confirmed', 'pending_coach']);
      next.scheduledAt = future(input.scheduledAt, now); next.proposedAt = null;
      next.scheduleVersion++; next.status = 'pending_coach'; label = '发起人提交新时间，等待教练确认'; break;
    case 'start':
      check(coach, ['confirmed']); next.status = 'in_progress'; label = '开始面试'; break;
    case 'finish':
      check(coach, ['in_progress']); next.status = 'report_draft'; label = '结束面试，待填写报告'; break;
    case 'save_report':
      check(coach, ['report_draft']); next.report = text(input.report, '报告草稿', 20000);
      label = '保存报告草稿'; break;
    case 'finalize':
      check(coach, ['report_draft']);
      fail('面试模板、正式报告及 PDF 交付尚未接入，当前只能保存草稿', 409); break;
    case 'cancel': case 'no_show':
      check(manager, ['pending_coach', 'pending_lisa', 'confirmed', 'in_progress', 'report_draft']);
      next.closureReason = text(input.reason, '结案原因', 1000, true);
      next.status = input.action === 'cancel' ? 'cancelled' : 'no_show';
      label = input.action === 'cancel' ? '取消面试' : '记录未到场'; break;
    case 'archive':
      check(manager, ['cancelled', 'no_show', 'delivered']);
      if (record.status === 'delivered') fail('正式报告归档需接入 PDF 文件核验后启用', 409);
      if (!record.closureReason) fail('请先填写结案原因');
      next.archivedAt = now; next.archivedBy = actor.id; next.archivedStatus = record.status;
      next.archiveNumber = `INT-${record.id}`; next.status = 'archived'; label = '归档结案资料'; break;
    default: fail('不支持的操作');
  }
  next.version++; next.updatedAt = now;
  next.history.push({ at: now, actorId: actor.id, action: input.action, label,
    scheduledAt: next.scheduledAt, proposedAt: next.proposedAt, reason: next.closureReason || '' });
  return next;
}
export function reminderPlan(record, now = new Date().toISOString()) {
  if (record.status !== 'confirmed') return [];
  return [1440, 60, 30].map(minutes => ({
    key: `${record.id}:${record.scheduleVersion}:${minutes}:${record.coachId}`,
    minutes, dueAt: new Date(Date.parse(record.scheduledAt) - minutes * 60000).toISOString(),
  })).filter(item => Date.parse(item.dueAt) > Date.parse(now));
}
export function progressStep(record) {
  return ({ pending_coach: 1, pending_lisa: 1, confirmed: 2, in_progress: 2, report_draft: 3,
    report_finalized: 4, pdf_ready: 4, delivered: 5, archived: 6 })[record.status] ?? 1;
}
