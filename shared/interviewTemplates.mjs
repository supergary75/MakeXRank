export const TEMPLATE_LEVELS = ['U9','U12','U15','U18'];
export const TEMPLATE_EDITORS = Object.freeze({ U9:['Gary','Brook','Jason'], U12:['Gary','Brook','Jason'], U15:['Gary','Vincent'], U18:['Gary'] });
const DEFAULT_SECTIONS = ['基本信息','面试观察','能力表现','学习建议','教练留言'];
function cleanText(value, label, max, required = true) {
  if (typeof value !== 'string' || (required && !value.trim()) || value.trim().length > max) throw Object.assign(new Error(`${label}格式不正确`),{status:400});
  return value.trim();
}
export function defaultTemplates(now = new Date().toISOString()) {
  return TEMPLATE_LEVELS.map(level=>({ id:level.toLowerCase(), level, name:`${level} 面试报告模板`, description:`适用于 ${level} 学员的面试记录。具体评价标准由授权人员维护。`, sections:[...DEFAULT_SECTIONS], version:1, updatedAt:now, updatedBy:null }));
}
export function canEditTemplate(template, actor) {
  const actorName = actor?.name === 'supergary' ? 'Gary' : actor?.name;
  return Boolean(actorName && TEMPLATE_EDITORS[template?.level]?.includes(actorName));
}
export function updateTemplate(current, input, actor, now = new Date().toISOString()) {
  if (!canEditTemplate(current,actor)) throw Object.assign(new Error(`你没有 ${current?.level || '该'} 模板的编辑权限`),{status:403});
  if (!Number.isInteger(input.version) || input.version !== current.version) throw Object.assign(new Error('模板已更新，请刷新后重试'),{status:409});
  if (!TEMPLATE_LEVELS.includes(current.level)) throw Object.assign(new Error('模板级别无效'),{status:400});
  if (!Array.isArray(input.sections) || input.sections.length<1 || input.sections.length>20) throw Object.assign(new Error('模板需包含 1 至 20 个栏目'),{status:400});
  const sections=input.sections.map((item,index)=>cleanText(item,`栏目 ${index+1}`,80));
  if (new Set(sections).size!==sections.length) throw Object.assign(new Error('模板栏目不能重复'),{status:400});
  return {...current,name:cleanText(input.name,'模板名称',100),description:cleanText(input.description||'','模板说明',500,false),sections,version:current.version+1,updatedAt:now,updatedBy:actor.id};
}
