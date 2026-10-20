export const makeupStatuses = {pending:'待安排',scheduled:'已安排补课',completed:'已补课',waived:'无需补课'};
export const emptyMakeupPlan = () => ({status:'pending',date:'',startTime:'',endTime:''});
export function makeupPlanError(plan, now = new Date()) {
  if(!plan || typeof plan!=='object' || Array.isArray(plan) || !Object.hasOwn(makeupStatuses,plan.status)
    || ['date','startTime','endTime'].some(key=>typeof plan[key]!=='string'))return '补课安排格式不正确。';
  if(['pending','waived'].includes(plan.status))return plan.date || plan.startTime || plan.endTime ? '待安排或无需补课时，请先清空补课时间。' : '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(plan.date) || !Number.isFinite(Date.parse(plan.date+'T00:00:00Z')) || new Date(plan.date+'T00:00:00Z').toISOString().slice(0,10)!==plan.date)return '请选择有效的补课日期。';
  if([plan.startTime,plan.endTime].some(time=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || plan.endTime<=plan.startTime)return '请填写补课开始和结束时间，结束时间应晚于开始时间。';
  if(plan.status==='completed' && new Date(`${plan.date}T${plan.endTime}:00+08:00`).getTime()>now.getTime())return '补课尚未结束，不能登记为已补课。';
  return '';
}
