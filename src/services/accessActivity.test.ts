import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const {token}=vi.hoisted(()=>({token:vi.fn()}));
vi.mock('./authService',()=>({getValidAccessToken:token}));
let api:typeof import('./accessActivity');
beforeEach(async()=>{vi.resetModules();token.mockReset().mockResolvedValue('isolated-owner-token');vi.stubEnv('VITE_SUPABASE_URL','https://isolated.test/api');vi.stubGlobal('window',new EventTarget());api=await import('./accessActivity');});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('private audit queries send credentials only as headers and preserve date/user/pagination filters',async()=>{
  const fetch=vi.fn(async()=>new Response(JSON.stringify({rows:[],total:0,nextBefore:null,trackingStartedAt:''})));vi.stubGlobal('fetch',fetch);
  await api.fetchAccessLog({from:'2026-10-20',to:'2026-10-20',username:'kclub-vincent',before:'105'});
  const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];const parsed=new URL(url);
  expect(parsed.pathname).toBe('/api/auth/v1/access-log');expect(parsed.searchParams.get('username')).toBe('kclub-vincent');expect(parsed.searchParams.get('before')).toBe('105');
  expect(url).not.toContain('isolated-owner-token');expect(init.headers).toMatchObject({Authorization:'Bearer isolated-owner-token'});expect(init.cache).toBe('no-store');
});
it('missing login never makes an anonymous audit request and forbidden responses fail closed',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);token.mockResolvedValue(null);await expect(api.fetchAccessEvents()).rejects.toThrow('管理员');expect(fetch).not.toHaveBeenCalled();
  token.mockResolvedValue('staff-token');fetch.mockResolvedValue(new Response('{}',{status:403}));await expect(api.fetchAccessEvents()).rejects.toThrow('只有 Gary');
});
it('read receipts are explicit, notify the badge, and do not delete history',async()=>{
  const changed=vi.fn();window.addEventListener(api.ACCESS_ACTIVITY_READ_EVENT,changed);
  const fetch=vi.fn(async()=>new Response('{"success":true}'));vi.stubGlobal('fetch',fetch);
  await api.markAccessEventsSeen('101');const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toContain('/access-events/seen');expect(init.method).toBe('POST');expect(JSON.parse(init.body as string)).toEqual({through:'101'});expect(changed).toHaveBeenCalledOnce();
});
it('dates and activity messages use Beijing time and never label session validity as online presence',()=>{
  expect(api.formatAccessTime('2026-10-19T16:00:00Z')).toBe('2026-10-20 00:00:00');expect(api.formatAccessTime(null)).toBe('—');
  expect(api.accessDate(0,new Date('2026-10-19T16:00:00Z'))).toBe('2026-10-20');
  expect(api.accessDate(-6,new Date('2026-10-19T16:00:00Z'))).toBe('2026-10-14');
  const row={id:'1',username:'fixture',displayName:'Fixture',loggedInAt:'',expiresAt:'',endedAt:null,endReason:null,passwordSetup:false,legacy:false};
  expect(api.accessStatus(row)).toContain('不代表在线');expect(api.accessStatus({...row,endReason:'logout'})).toBe('主动退出');
  expect(api.accessEventMessage({id:'1',username:'fixture',displayName:'Fixture',at:'2026-10-19T16:00:00Z',type:'expired'})).toContain('2026-10-20 00:00:00 会话到期');
});
