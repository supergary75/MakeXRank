import { expect, it } from 'vitest';
import type { AuthUserProfile } from '../types';
import { classAccess } from './classAccess';
const user = (username: string, extra: Partial<AuthUserProfile> = {}): AuthUserProfile => ({ authUserId: 'test', username, displayName: 'Gary', role: 'admin', isActive: true, createdAt: '', allowedCompetitionIds: null, allowedEventTypes: null, ...extra });
it('Gary 和 Lisa 查看全部', () => {
  for (const name of ['supergary', 'Gary', 'Lisa']) expect(classAccess(user(name)).all).toBe(true);
});
it('教练只能匹配本人班级', () => {
  expect(classAccess(user('Brook'))).toEqual({ all: false, coach: 'B' });
  expect(classAccess(user('Vincent'))).toEqual({ all: false, coach: 'V' });
  expect(classAccess(user('Jason'))).toEqual({ all: false, coach: 'J' });
});
it('显示名和通用管理员角色不能授予全部权限', () => expect(classAccess(user('other')).all).toBe(false));
it('未登录及停用账号不可见', () => {
  expect(classAccess(null)).toEqual({ all: false, coach: null });
  expect(classAccess(user('supergary', { isActive: false }))).toEqual({ all: false, coach: null });
});
