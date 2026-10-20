import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import LoginActivity,{AccessHistoryRows} from './LoginActivity';
import AccessActivityNotifier from './AccessActivityNotifier';
import type {AuthUserProfile} from '../../types';
const user=(username='supergary')=>({username,authUserId:'fixture-owner',displayName:'Fixture',role:'admin',isActive:true,mustChangePassword:false} as AuthUserProfile);
it('audit controls and notices are hidden from guests and other administrator-role employees',()=>{
  for(const profile of [null,user('kclub-vincent'),{...user(),isActive:false}]){
    expect(renderToStaticMarkup(<LoginActivity user={profile} users={[]}/>)).toBe('');
    expect(renderToStaticMarkup(<AccessActivityNotifier user={profile} onOpen={()=>{}} onNotify={()=>{}}/>)).toBe('');
  }
  const html=renderToStaticMarkup(<LoginActivity user={user()} users={[user()]}/>);expect(html).toContain('登录与退出记录');expect(html).toContain('北京时间');expect(html).toContain('关闭网页');expect(html).toContain('登录提示全部标为已读');
});
it('session rows distinguish logout, expiry, setup and legacy records with mobile cell labels',()=>{
  const base={id:'1',username:'fixture',displayName:'Fixture',loggedInAt:'2026-10-20T00:00:00Z',expiresAt:'2026-10-27T00:00:00Z',endedAt:null,endReason:null,passwordSetup:false,legacy:false};
  const html=renderToStaticMarkup(<AccessHistoryRows rows={[base,{...base,id:'2',endedAt:'2026-10-20T01:00:00Z',endReason:'logout'},{...base,id:'3',endReason:'expired'},{...base,id:'4',passwordSetup:true,legacy:true,endReason:'legacy_revoked'}]}/>);
  for(const label of ['登录有效（不代表在线）','主动退出','会话到期','首次验证会话','历史失效（原因未记录）','历史会话 · 原系统留存','data-label="退出或失效时间"','2026-10-20 08:00:00'])expect(html).toContain(label);
});
