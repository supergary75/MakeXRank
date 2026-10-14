export function canManageStaff(profile) {
  return profile?.is_active === true && profile.role === 'admin' && profile.username?.trim().toLowerCase() === 'supergary';
}
