export const curriculumLevels = ['U9','U12B','U12A','U15B','U15A','U18B','U18A'];
export function curriculumPermissions(actor, level) {
  const name = actor?.username?.trim().toLowerCase();
  const reviewer = actor?.is_active === true && actor.role === 'admin' && name === 'supergary';
  const editor = actor?.is_active === true && curriculumLevels.includes(level) && (reviewer ||
    (['brooky','jasonz','kclub-brook','kclub-jason'].includes(name) && ['U9','U12B','U12A'].includes(level)) || (['vincentc','kclub-vincent'].includes(name) && level === 'U15B'));
  return { edit: !!editor, publish: !!reviewer };
}
export function curriculumFail(status, message) { throw Object.assign(new Error(message), {status}); }
export function validateMonth(value) {
  const limits = {title:100,learning:4000,practice:4000,evidence:2000};
  if (!value || typeof value !== 'object' || Array.isArray(value)) curriculumFail(400,'月度内容格式错误');
  const content = {};
  for (const [key,limit] of Object.entries(limits)) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > limit) curriculumFail(400,`请完整填写月度内容（${key}，最多 ${limit} 字）`);
    content[key] = value[key].trim();
  }
  return content;
}
export function transitionMonth(row, input, actor, level) {
  const permission = curriculumPermissions(actor,level);
  if (!permission.edit) curriculumFail(403,'你没有这个级别的课程编辑权限');
  if (!Number.isInteger(input.revision) || input.revision !== row.revision) curriculumFail(409,'内容已被其他人更新。请重新加载后核对，避免覆盖他人的修改。');
  const next = {...row,revision:row.revision+1};
  switch(input.action) {
    case 'save':
      if (row.state === 'submitted') curriculumFail(409,'该草稿正在审核，请先由 Gary 退回修改');
      next.draft = validateMonth(input.content); next.state='draft'; next.note=null; break;
    case 'submit':
      if (row.state !== 'draft' || !row.draft) curriculumFail(409,'请先保存草稿后再提交');
      next.state='submitted'; next.note=null; break;
    case 'publish':
      if (!permission.publish) curriculumFail(403,'仅 Gary 可以发布课程');
      if (row.state !== 'submitted' || !row.draft) curriculumFail(409,'请先保存并提交讨论稿，再由 Gary 最终确认');
      if (input.content) curriculumFail(400,'最终确认只能采用已提交的讨论稿，不能临时替换内容');
      next.published=validateMonth(row.draft);
      next.draft=null; next.state='published'; next.note=null; break;
    case 'return':
      if (!permission.publish) curriculumFail(403,'仅 Gary 可以退回审核');
      if (row.state !== 'submitted') curriculumFail(409,'该月没有待审核内容');
      if (typeof input.note !== 'string' || !input.note.trim() || input.note.length>1000) curriculumFail(400,'请填写退回修改意见（最多1000字）');
      next.state='draft'; next.note=input.note.trim(); break;
    case 'restore':
      if (!permission.publish) curriculumFail(403,'仅 Gary 可以恢复历史版本');
      if (row.draft) curriculumFail(409,'请先完成当前草稿的审核与发布，再恢复历史版本');
      next.published=validateMonth(input.restoredContent); next.state='published'; next.note=null; break;
    default: curriculumFail(400,'不支持的课程操作');
  }
  return next;
}
