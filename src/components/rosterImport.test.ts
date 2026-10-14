import { expect, it } from 'vitest';
import { parseRoster, planRosterImport, planRosterRecovery } from './rosterImport';
it('识别 Markdown、人数粗体与换行续名单',()=>{
 const result=parseRoster('| 周日 | U18-01 | 上午 | 9:30-12:30 | G | 2 | **0** | 测试甲 |\n| :--: | :-- | -- | -- | -- | -- | -- | -- |\n| 测试乙 | |');
 expect(result[0].names).toEqual(['测试甲','测试乙']);
});
it('转班保留 ID，移除旧班记录',()=>{
 const plan=planRosterImport('U12B-07|测试甲\nU12B-08|测试乙',{ 'U12B-07':[{id:'one',name:'测试甲'},{id:'two',name:'测试乙'}] });
 expect(plan.next['U12B-08'][0].id).toBe('two');expect(plan.next['U12B-07']).toHaveLength(1);
});
it('重复匹配拒绝自动合并',()=>expect(()=>planRosterImport('U12B-08|同名',{'U12B-07':[{id:'a',name:'同名'},{id:'b',name:'同名'}]})).toThrow());
it('人数以名单为准，空班不会把数字当姓名',()=>expect(parseRoster('| 周六 | U12B-07 | 上午 | 10:00-12:00 | B | 0 | **8** | |')[0].names).toEqual([]));
it('恢复模式不移出现有队员，也不按旧表转班',()=>{
 const old={'U12B-07':[{id:'one',name:'测试甲'},{id:'extra',name:'较新队员'}],'U12B-08':[{id:'two',name:'测试乙'}]};
 const plan=planRosterRecovery('U12B-07|测试甲|测试乙|新增姓名',old);
 expect(plan.next['U12B-07'].map(m=>m.name)).toEqual(['测试甲','较新队员','新增姓名']);
 expect(plan.next['U12B-07'][0].id).toBe('one');expect(plan.next['U12B-08']).toBeUndefined();
 expect(plan.changes.join('')).toContain('保留现有分班');
});
it('恢复姓名沿用历史 ID 并填充未关联的空占位',()=>{
 const plan=planRosterRecovery('U12B-07|历史队员|新队员',{'U12B-07':[{id:'placeholder',name:''}]},[{id:'historic',name:'历史队员'}]);
 expect(plan.next['U12B-07']).toContainEqual({id:'historic',name:'历史队员'});
 expect(plan.next['U12B-07']).toContainEqual({id:'placeholder',name:'新队员'});
});
it('历史重名或重复 ID 不擅自合并',()=>{
 expect(()=>planRosterRecovery('U12B-07|历史队员',{},[{id:'one',name:'历史队员'},{id:'two',name:'历史队员'}])).toThrow('历史 ID');
 expect(()=>planRosterRecovery(JSON.stringify({rosters:{'U12B-07':[{id:'shared',name:'姓名甲'},{id:'shared',name:'姓名乙'}]}}),{})).toThrow('重复');
});
it('JSON 备份恢复和替换均保留稳定 ID',()=>{
 const backup=JSON.stringify({rosters:{'U12B-07':[{id:'saved-id',name:'已保存姓名'}]}});
 expect(planRosterRecovery(backup,{}).next['U12B-07'][0].id).toBe('saved-id');
 expect(planRosterImport(backup,{}).next['U12B-07'][0].id).toBe('saved-id');
 expect(parseRoster(JSON.stringify({rosters:{'U12B-07':['来源姓名']},pausedReference:{'U12B-07':['停课姓名']}}))[0].names).toEqual(['来源姓名']);
});
it('拒绝损坏备份、未知班级及空白身份',()=>{
 for(const backup of ['{broken',JSON.stringify({rosters:{UNKNOWN:['姓名']}}),JSON.stringify({rosters:{'U12B-07':[{id:'',name:'姓名'}]}})])expect(()=>planRosterRecovery(backup,{})).toThrow();
});
