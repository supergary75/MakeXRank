export type MakeupStatus = 'pending' | 'scheduled' | 'completed' | 'waived';
export interface MakeupPlan {status:MakeupStatus;date:string;startTime:string;endTime:string}
export const makeupStatuses: Record<MakeupStatus,string>;
export function emptyMakeupPlan():MakeupPlan;
export function makeupPlanError(plan:unknown,now?:Date):string;
