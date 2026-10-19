// Schedules only. Never put student identities in this public module.
export const coachNames = { B: 'Brook', V: 'Vincent', G: 'Gary', J: 'Jason', L: 'Lyu' };
export const classes = [
  { id: 'U12A-06', day: '周四', time: '18:00–20:00', coach: 'V', count: 8, seats: 0 },
  { id: 'U12A-05', day: '周五', time: '17:00–19:00', coach: 'V', count: 7, seats: 1 },
  { id: 'U12B-07', day: '周六', time: '10:00–12:00', coach: 'B', count: 7, seats: 1 },
  { id: 'U15A-03', day: '周六', time: '10:00–12:00', coach: 'G', count: 2, seats: 6 },
  { id: 'U12B-03', day: '周六', time: '13:30–15:30', coach: 'B', count: 8, seats: 0 },
  { id: 'U15B-03', day: '周六', time: '13:30–15:30', coach: 'V', count: 5, seats: 3 },
  { id: 'U9A-04', day: '周六', time: '16:00–18:00', coach: 'B', count: 7, seats: 1 },
  { id: 'U15B-05', day: '周六', time: '16:00–18:00', coach: 'G', count: 8, seats: 0 },
  { id: 'U12B-09', day: '周日', time: '10:00–12:00', coach: 'B', count: 6, seats: 2 },
  { id: 'U12A-04', day: '周日', time: '10:00–12:00', coach: 'V', count: 5, seats: 3 },
  { id: 'U18-01', day: '周日', time: '09:30–12:30', coach: 'G', count: 10, seats: 0 },
  { id: 'U9B-05', day: '周日', time: '13:30–15:30', coach: 'B', count: 3, seats: 5 },
  { id: 'U15B-06', day: '周日', time: '13:30–15:30', coach: 'V', count: 4, seats: 4 },
  { id: 'U12B-08', day: '周日', time: '16:00–18:00', coach: 'B', count: 7, seats: 1 },
  { id: 'U18-02', day: '周日', time: '16:00–19:00', coach: 'G', count: 5, seats: 3 },
];
export function academicAccess(profile) {
  const active = profile?.isActive ?? profile?.is_active;
  const username = profile?.username?.trim().toLowerCase();
  const coach = active ? ({supergary:'G',gary:'G',brook:'B',brooky:'B',vincent:'V',vincentc:'V',jason:'J',jasonz:'J',lyu:'L'})[username] ?? null : null;
  const all = Boolean(active && ['supergary','gary','lisa','lisaw'].includes(username));
  return { all, coach, write: Boolean(active && ['admin','editor'].includes(profile.role) && (all || coach)) };
}
