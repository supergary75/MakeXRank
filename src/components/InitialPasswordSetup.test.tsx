import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import InitialPasswordSetup from './InitialPasswordSetup';

it('first-login page offers only password setup or logout, with two masked new-password fields',()=>{
  const html=renderToStaticMarkup(<InitialPasswordSetup username="kclub-vincent" busy={false} onSave={async()=>{}} onLogout={()=>{}}/>);
  expect(html).toContain('Kclub内部工作台');expect(html).toContain('kclub-vincent');expect(html).toContain('10 分钟');
  expect((html.match(/type="password"/g)||[]).length).toBe(2);expect(html.toLowerCase()).toContain('autocomplete="new-password"');
  expect(html).toContain('minLength="15"');expect(html).toContain('确认新密码并进入工作台');expect(html).toContain('退出，稍后设置');
  expect(html).not.toContain('data-workbench-entry');expect(html).not.toContain('data-roll-call-list');
});
