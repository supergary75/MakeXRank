import { expect, it } from 'vitest';
import { canManageStaff } from './staffAccess';
import type { AuthUserProfile } from '../types';
const user=(username:string,extra:Partial<AuthUserProfile>={}):AuthUserProfile=>({authUserId:'test',username,displayName:'Gary',role:'admin',isActive:true,createdAt:'',allowedEventTypes:null,allowedCompetitionIds:null,...extra});
it('only active supergary admin can manage employees',()=>{
  expect(canManageStaff(user('supergary'))).toBe(true);
  for(const name of ['gary','lisaw','brooky','vincentc','jasonz'])expect(canManageStaff(user(name))).toBe(false);
  expect(canManageStaff(user('supergary',{isActive:false}))).toBe(false);
  expect(canManageStaff(user('supergary',{role:'viewer'}))).toBe(false);
  expect(canManageStaff(null)).toBe(false);
});
