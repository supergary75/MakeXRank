import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadRosters, saveRosters, rosterSnapshot } from './classRoster';
beforeEach(()=>{const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});});
afterEach(()=>vi.unstubAllGlobals());
it('不同班级更新合并不丢失',()=>{
  saveRosters({A:[{id:'a',name:'测试甲'}]},{});
  saveRosters({B:[{id:'b',name:'测试乙'}]},{});
  expect(Object.keys(loadRosters())).toEqual(['A','B']);
});
it('同班级旧页面无法覆盖新名单',()=>{
  saveRosters({A:[{id:'a',name:'测试甲'}]},{});
  expect(()=>saveRosters({A:[]},{})).toThrow('其他页面');
  expect(loadRosters().A).toHaveLength(1);
});
it('损坏名单不能自动覆盖且提供错误',()=>{
  localStorage.setItem('makexrank-class-members-v1','broken');
  expect(rosterSnapshot().error).not.toBe('');
  expect(()=>saveRosters({A:[]},{})).toThrow();
});
it('写入失败不能返回成功',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw new Error('Full');}});
  expect(()=>saveRosters({A:[]},{})).toThrow('Full');
});
it('更新名册时保存上一版且不修改历史考勤键',()=>{
 const first={A:[{id:'stable-id',name:'已保存姓名'}]};
 saveRosters(first,{});
 localStorage.setItem('makexrank-attendance-v1:2026-10-01:A','existing-attendance');
 saveRosters({A:[...first.A,{id:'new-id',name:'新增姓名'}]},first);
 expect(JSON.parse(localStorage.getItem('makexrank-class-members-backup-v1')!)).toEqual(first);
 expect(localStorage.getItem('makexrank-attendance-v1:2026-10-01:A')).toBe('existing-attendance');
});
