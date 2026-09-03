export interface Staff { id: string; name: string; role: 'manager' | 'coach'; canInitiate: boolean }
export interface Interview {
  id: string; managerId: string; coachId: string; studentName: string; grade: string; course: string;
  experience: string; notes: string; location: string; scheduledAt: string; timezone: string;
  status: string; version: number; scheduleVersion: number; proposedAt: string | null;
  templateStatus: string; report: string; reportVersion: number; createdAt: string; updatedAt: string;
  archivedAt: string | null; archivedBy?: string; archivedStatus?: string; archiveNumber?: string; closureReason?: string;
  history: Array<{ at: string; actorId: string; action: string; label: string; scheduledAt?: string; proposedAt?: string | null; reason?: string }>;
}
export interface InterviewInput { id: string; studentName: string; grade: string; course: string; coachId: string; scheduledAt: string; experience?: string; notes?: string; location?: string }
export interface InterviewAction { action: string; version: number; scheduledAt?: string; report?: string; reason?: string }
export const STAGES: Record<string, string>;
export function canRead(record: Interview, actor: Staff): boolean;
export function createInterview(input: InterviewInput, actor: Staff, coaches: Staff[], now?: string): Interview;
export function transitionInterview(record: Interview, actor: Staff, input: InterviewAction, now?: string): Interview;
export function reminderPlan(record: Interview, now?: string): Array<{ key: string; minutes: number; dueAt: string }>;
export function progressStep(record: Interview): number;
