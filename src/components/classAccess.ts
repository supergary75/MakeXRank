import type { AuthUserProfile } from '../types';
import { academicAccess } from '../../shared/classDirectory.mjs';
export function assignedCoach(user: AuthUserProfile | null | undefined): string | null {
  if (!user?.isActive) return null;
  return academicAccess(user).coach;
}
export function classAccess(user: AuthUserProfile | null | undefined) {
  const {all,coach}=academicAccess(user);
  return {all,coach:all?null:coach};
}
