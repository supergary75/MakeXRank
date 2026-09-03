import type { Staff } from './interviewWorkflow.mjs';
export interface InterviewTemplate { id:string; level:string; name:string; description:string; sections:string[]; version:number; updatedAt:string; updatedBy:string|null }
export const TEMPLATE_LEVELS: string[];
export const TEMPLATE_EDITORS: Readonly<Record<string,readonly string[]>>;
export function defaultTemplates(now?:string): InterviewTemplate[];
export function canEditTemplate(template:InterviewTemplate,actor:Staff|null|undefined):boolean;
export function updateTemplate(current:InterviewTemplate,input:{version:number;name:string;description:string;sections:string[]},actor:Staff,now?:string):InterviewTemplate;
