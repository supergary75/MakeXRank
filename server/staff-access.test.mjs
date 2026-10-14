import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canManageStaff } from './staff-access.mjs';
test('server staff authority cannot be obtained by role or display name',()=>{
  const profile={username:'supergary',role:'admin',is_active:true};
  assert.equal(canManageStaff(profile),true);
  for(const username of ['lisaw','brooky','jasonz','vincentc','gary'])assert.equal(canManageStaff({...profile,username,display_name:'supergary'}),false);
  assert.equal(canManageStaff({...profile,is_active:false}),false);
  assert.equal(canManageStaff({...profile,role:'editor'}),false);
  assert.equal(canManageStaff(null),false);
});
