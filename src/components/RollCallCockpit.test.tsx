import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RollCallCockpit, { cockpitLevel } from './RollCallCockpit';

describe('roll call cockpit',()=>{
  it('maps all class levels including legacy aliases',()=>{
    expect(['U9A-04','U9B-05','U12B-10','U12A-06','U15B-03','U15A-03','U18B-01','U18A-01','U18-02'].map(cockpitLevel))
      .toEqual(['U9','U9','U12B','U12A','U15B','U15A','U18B','U18','U18']);
  });
  it('uses seven distinct instrument layouts',()=>{
    const layouts=['U9','U12B','U12A','U15B','U15A','U18B','U18'].map(classId=>renderToStaticMarkup(<RollCallCockpit classId={classId} total={8} confirmed={3} present={2} leave={1}/>).match(/data-layout="([^"]+)"/)?.[1]);
    expect(new Set(layouts).size).toBe(7);
  });
  it('handles an empty class without invalid gauge values',()=>{
    const html=renderToStaticMarkup(<RollCallCockpit classId="U9A-04" total={0} confirmed={0} present={0} leave={0}/>);
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain('非飞行参数');
  });
  it('does not pretend unavailable records are zero attendance',()=>{
    const html=renderToStaticMarkup(<RollCallCockpit classId="U18-01" total={8} confirmed={0} present={0} leave={0} available={false}/>);
    expect(html).toContain('仪表暂停');
    expect(html).not.toContain('到课人数');
  });
});
