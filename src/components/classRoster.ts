export const coachNames: Record<string, string> = { B: 'Brook', V: 'Vincent', G: 'Gary' };
const storageKey = 'makexrank-class-members-v1';
export type Member = { id: string; name: string };
export type Rosters = Record<string, Member[]>;
export function loadRosters(): Rosters {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    for (const list of Object.values(data)) {
      if (!Array.isArray(list) || !list.every(member => member && typeof member.id === 'string' && typeof member.name === 'string')) throw new Error();
    }
    return data as Rosters;
  } catch { throw new Error('班级名单读取失败，请勿覆盖原数据。请检查浏览器存储权限或恢复备份。'); }
}

export function rosterSnapshot(): { rosters: Rosters; error: string } {
  try { return { rosters: loadRosters(), error: '' }; }
  catch (error) { return { rosters: {}, error: String(error) }; }
}

export function saveRosters(changes: Rosters, expected: Rosters): Rosters {
  const current = loadRosters();
  for (const id of Object.keys(changes)) {
    if (JSON.stringify(current[id]) !== JSON.stringify(expected[id])) throw new Error(`班级 ${id} 已被其他页面更新，请重新加载名单后再修改。`);
  }
  const next = { ...current, ...changes };
  // Keep the previous valid version before writing; never discard attendance.
  if(Object.keys(current).length)localStorage.setItem('makexrank-class-members-backup-v1',JSON.stringify(current));
  localStorage.setItem(storageKey, JSON.stringify(next));
  if(typeof window!=='undefined')window.dispatchEvent(new Event('class-rosters-updated'));
  return next;
}

// Class-level schedule only. Student identities must not be bundled in public assets.
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
