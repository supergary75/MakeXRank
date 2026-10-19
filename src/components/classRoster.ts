import { academicCloudEnabled, cloudSnapshot, saveCloudRosters } from '../services/academicCloud';
export { classes, coachNames } from '../../shared/classDirectory.mjs';
const storageKey = 'makexrank-class-members-v1';
export type Member = { id: string; name: string };
export type Rosters = Record<string, Member[]>;
export function loadRosters(): Rosters {
  if(academicCloudEnabled)return Object.fromEntries(cloudSnapshot().rosters.map(r=>[r.class_id,r.members]));
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
  if(academicCloudEnabled)throw new Error('请通过云端保存入口修改名单。');
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

export async function persistRosters(changes:Rosters,expected:Rosters):Promise<Rosters> {
  return academicCloudEnabled ? saveCloudRosters(changes,expected) : saveRosters(changes,expected);
}
