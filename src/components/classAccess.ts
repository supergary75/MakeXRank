import type { AuthUserProfile } from '../types';
export function assignedCoach(user: AuthUserProfile | null | undefined): string | null {
  if (!user?.isActive) return null;
  return ({ supergary: 'G', gary: 'G', brook: 'B', brooky: 'B', vincent: 'V', vincentc: 'V', jason: 'J', jasonz: 'J' } as Record<string, string>)[user.username.trim().toLowerCase()] ?? null;
}
export function classAccess(user: AuthUserProfile | null | undefined) {
  if (!user?.isActive) return { all: false, coach: null };
  // Match login identity, never the editable display name or the general admin role.
  const username = user.username.trim().toLowerCase();
  if (['supergary', 'gary', 'lisa', 'lisaw'].includes(username)) return { all: true, coach: null };
  return { all: false, coach: assignedCoach(user) };
}
