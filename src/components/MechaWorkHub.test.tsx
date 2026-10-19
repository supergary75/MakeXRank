import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import MechaWorkHub from './MechaWorkHub';

vi.mock('../services/academicCloud',()=>({academicCloudEnabled:true}));

it('describes cloud academic records accurately in the deployed full website',()=>{
  const html=renderToStaticMarkup(<MechaWorkHub action={null} onNavigate={()=>{}}/>);
  expect(html).toContain('云端教务');
  expect(html).toContain('通过腾讯云按账号权限同步');
  expect(html).not.toContain('尚未跨设备同步');
  expect(html).not.toContain('本地记录');
});
