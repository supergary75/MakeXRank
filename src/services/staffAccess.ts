import type { AuthUserProfile } from '../types';
export function canManageStaff(user: AuthUserProfile | null | undefined): boolean {
  return !!user?.isActive && user.role === 'admin' && user.username.trim().toLowerCase() === 'supergary';
}
