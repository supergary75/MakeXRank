export interface TrainingMember { id: string; name: string; teamNo: string; teamName: string }
export interface TrainingRoster { members: TrainingMember[]; source: TrainingMember[]; confirmedAt: string }
export function normalizeTrainingRoster(value: unknown): TrainingRoster | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v=value as Partial<TrainingRoster>;
  if(!Array.isArray(v.members)||!Array.isArray(v.source))return undefined;
  const clean=(rows:TrainingMember[])=>rows.filter(r=>r&&typeof r.id==='string'&&typeof r.name==='string').map(r=>({id:r.id,name:r.name,teamNo:typeof r.teamNo==='string'?r.teamNo:'',teamName:typeof r.teamName==='string'?r.teamName:''}));
  return {members:clean(v.members),source:clean(v.source),confirmedAt:typeof v.confirmedAt==='string'?v.confirmedAt:''};
}
export function rosterChanges(before:TrainingMember[],after:TrainingMember[]){
  return {added:after.filter(r=>!before.some(b=>b.id===r.id)),removed:before.filter(r=>!after.some(a=>a.id===r.id)),updated:after.filter(r=>before.some(b=>b.id===r.id&&(b.name!==r.name||b.teamNo!==r.teamNo||b.teamName!==r.teamName)))};
}
