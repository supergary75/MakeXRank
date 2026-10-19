import {afterEach,beforeEach,expect,it,vi} from 'vitest';

const key='competitive-ranking-board::auth-session';
const start=Date.parse('2026-10-19T00:00:00Z'),deadline=start+7*86400000;
const profile={auth_user_id:'fixture-id',username:'fixture',display_name:'Fixture',role:'editor',is_active:true,created_at:'',allowed_event_types:null,allowed_competition_ids:null};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
let memory:Map<string,string>,events:EventTarget,api:typeof import('./authService');
const tokenResponse=()=>({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600,session_expires_at:new Date(deadline).toISOString(),user:{id:'fixture-id'}});
const store=(expiresAt=start-1,refreshToken='old-refresh')=>memory.set(key,JSON.stringify({accessToken:'old-access',refreshToken,expiresAt,sessionExpiresAt:deadline}));

beforeEach(async()=>{
  vi.resetModules();vi.useFakeTimers();vi.setSystemTime(start);
  vi.stubEnv('VITE_SUPABASE_URL','https://fixture.test/api');vi.stubEnv('VITE_SUPABASE_ANON_KEY','public-fixture');
  memory=new Map();events=new EventTarget();
  const storage={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)};
  vi.stubGlobal('window',Object.assign(events,{localStorage:storage}));vi.stubGlobal('localStorage',storage);vi.stubGlobal('navigator',{});
  api=await import('./authService');
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});

it('sign-in stores only rotating credentials and the fixed seven-day deadline, never the password',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('/auth/v1/token')?json(tokenResponse()):json([profile])));
  await api.signInWithUsername('Fixture','FixturePassword123!');
  expect(JSON.parse(memory.get(key)!)).toMatchObject({accessToken:'new-access',sessionExpiresAt:deadline});
  expect(memory.get(key)).not.toContain('FixturePassword123!');
});

it('reopening the browser with a valid session restores the user without a password request',async()=>{
  store(start+3600000);const fetch=vi.fn(async(url:string)=>url.includes('/auth/v1/user')?json({id:'fixture-id'}):json([profile]));vi.stubGlobal('fetch',fetch);
  expect((await api.restoreAuthUser())?.username).toBe('fixture');
  expect(fetch.mock.calls.every(([url])=>!url.includes('/token'))).toBe(true);
});

it('an expired short access token silently refreshes without resetting the seven-day deadline',async()=>{
  store();const fetch=vi.fn(async(url:string)=>url.includes('grant_type=refresh_token')?json(tokenResponse()):url.includes('/auth/v1/user')?json({id:'fixture-id'}):json([profile]));vi.stubGlobal('fetch',fetch);
  expect((await api.restoreAuthUser())?.username).toBe('fixture');
  expect(fetch.mock.calls.some(([url])=>url.includes('grant_type=password'))).toBe(false);
  expect(JSON.parse(memory.get(key)!).sessionExpiresAt).toBe(deadline);
});

it('the seven-day deadline clears local login even if the short-token timestamp is later',async()=>{
  store(deadline+3600000);vi.setSystemTime(deadline);const cleared=vi.fn();events.addEventListener(api.AUTH_SESSION_CLEARED_EVENT,cleared);
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect(await api.getValidAccessToken()).toBeNull();expect(memory.has(key)).toBe(false);expect(cleared).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();
});

it('parallel refresh callers share one rotation and transient network failure does not forget login',async()=>{
  store();const fetch=vi.fn(async()=>json(tokenResponse()));vi.stubGlobal('fetch',fetch);
  expect(await Promise.all([api.getValidAccessToken(),api.getValidAccessToken()])).toEqual(['new-access','new-access']);expect(fetch).toHaveBeenCalledOnce();
  store();vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('offline');}));expect(await api.getValidAccessToken()).toBeNull();expect(memory.has(key)).toBe(true);
});

it('server rejection clears login; a token rotated in another tab is reused rather than replayed',async()=>{
  store();vi.stubGlobal('fetch',vi.fn(async()=>json({message:'Invalid refresh token'},401)));
  expect(await api.getValidAccessToken()).toBeNull();expect(memory.has(key)).toBe(false);
  store();const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  vi.stubGlobal('navigator',{locks:{request:async(_name:string,work:()=>Promise<unknown>)=>{store(start+3600000,'other-tab-refresh');return work();}}});
  expect(await api.getValidAccessToken()).toBe('old-access');expect(fetch).not.toHaveBeenCalled();expect(memory.has(key)).toBe(true);
});

it('a refresh completing after explicit sign-out cannot restore the cached session',async()=>{
  store();let finish!:(r:Response)=>void;
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('/logout')?new Response(null,{status:204}):new Promise<Response>(resolve=>{finish=resolve;})));
  const pending=api.getValidAccessToken();expect(finish).toBeTypeOf('function');await api.signOutCurrentUser();finish(json(tokenResponse()));expect(await pending).toBeNull();expect(memory.has(key)).toBe(false);
});
