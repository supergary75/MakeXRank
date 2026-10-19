export interface ClassSchedule { id:string; day:string; time:string; coach:string; count:number; seats:number }
export const classes: ClassSchedule[];
export const coachNames: Record<string,string>;
export function academicAccess(profile: {username:string;role:string;isActive?:boolean;is_active?:boolean}|null|undefined): {all:boolean;coach:string|null;write:boolean};
