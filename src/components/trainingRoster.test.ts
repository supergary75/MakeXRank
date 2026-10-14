import {describe,it,expect} from 'vitest';
import {normalizeTrainingRoster,rosterChanges} from './trainingRoster';
describe('集训名单独立确认',()=>{
  const one={id:'1',name:'队员一',teamNo:'A',teamName:''};
  const two={id:'2',name:'队员二',teamNo:'B',teamName:''};
  it('区分新增、退出和资料变更',()=>{
    const changes=rosterChanges([one,two],[{...one,teamNo:'C'},{...two,id:'3'}]);
    expect(changes.added.map(m=>m.id)).toEqual(['3']);expect(changes.removed.map(m=>m.id)).toEqual(['2']);expect(changes.updated.map(m=>m.id)).toEqual(['1']);
  });
  it('持久化后保持已选名单与来源快照分离',()=>{
    const roster=normalizeTrainingRoster(JSON.parse(JSON.stringify({members:[one],source:[one,two],confirmedAt:'2026-09-23'})));
    expect(roster?.members).toHaveLength(1);expect(roster?.source).toHaveLength(2);
    expect(rosterChanges(roster!.source,[one,two]).added).toHaveLength(0);
  });
  it('旧记录不能自动变成已确认名单',()=>{expect(normalizeTrainingRoster(undefined)).toBeUndefined();});
});
