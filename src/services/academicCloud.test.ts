import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthUserProfile } from '../types';
const user:AuthUserProfile={authUserId:'fixture-admin',username:'supergary',displayName:'Fixture Coach',role:'admin',isActive:true,createdAt:'',allowedEventTypes:null,allowedCompetitionIds:null};
const member={id:'fixture-member',name:'Fixture Student'};
const snapshot=()=>({permissions:{all:true,coach:'G',write:true},classIds:['U15A-03'],rosters:[{class_id:'U15A-03',revision:1,members:[member]}],attendance:[],holidays:[]});
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
let memory:Map<string,string>;
let api:typeof import('./academicCloud');
beforeEach(async()=>{
  vi.resetModules();vi.stubEnv('VITE_ACADEMIC_API_URL','http://fixture.test/api');
  memory=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),key:(i:number)=>[...memory.keys()][i]??null,get length(){return memory.size;}});
  vi.stubGlobal('window',new EventTarget());
  vi.doMock('./authService',()=>({getValidAccessToken:async()=> 'fixture-token'}));
  vi.stubGlobal('fetch',vi.fn(async()=>json(snapshot())));
  api=await import('./academicCloud');
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.doUnmock('./authService');});
async function connect(){api.startAcademicCloud(user);await api.refreshAcademic();}
it('cloud mode never reads legacy private rosters as another account or as a guest',async()=>{
  memory.set('makexrank-class-members-v1',JSON.stringify({'legacy-private':[member]}));
  expect(()=>api.cloudSnapshot()).toThrow('登录');await connect();
  expect(api.cloudSnapshot().rosters).toHaveLength(1);api.startAcademicCloud(null);expect(api.getAcademicState().snapshot).toBeNull();expect(()=>api.cloudSnapshot()).toThrow();
});
it('acknowledged roster saves use server revision and update the scoped snapshot, not legacy storage',async()=>{
  await connect();vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{
    const body=JSON.parse(init.body as string);expect(body.revisions['U15A-03']).toBe(1);return json({rosters:[{class_id:'U15A-03',revision:2,members:[]}]});
  }));
  await api.saveCloudRosters({'U15A-03':[]},{'U15A-03':[member]});
  expect(api.cloudSnapshot().rosters[0].members).toEqual([]);expect(memory.has('makexrank-class-members-v1')).toBe(false);expect(api.getAcademicState().pending).toBe(0);
});
it('refuses stale UI roster snapshots before sending a write',async()=>{
  await connect();const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(api.saveCloudRosters({'U15A-03':[]},{})).rejects.toThrow('更新');expect(fetch).not.toHaveBeenCalled();
});
it('failed writes never update statistics and retain a separate recoverable unsaved backup',async()=>{
  await connect();vi.stubGlobal('fetch',vi.fn(async()=>json({message:'Other device changed this record'},409)));
  await expect(api.saveCloudRosters({'U15A-03':[]},{'U15A-03':[member]})).rejects.toThrow('Other device');
  expect(api.cloudSnapshot().rosters[0].members).toEqual([member]);expect(api.getAcademicState().message).toContain('未同步备份');expect(Object.keys(api.unsavedAcademicChanges())).toEqual(['/rosters:U15A-03']);
});
it('cached data is view-only when the network is unavailable',async()=>{
  await connect();vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline');}));await api.refreshAcademic();
  expect(api.getAcademicState().phase).toBe('error');expect(api.cloudSnapshot().rosters[0].members).toEqual([member]);
  await expect(api.saveCloudRosters({'U15A-03':[]},{'U15A-03':[member]})).rejects.toThrow('仅可查看缓存');
});
it('late background snapshots cannot overwrite a newer acknowledged write',async()=>{
  await connect();let finish!: (r:Response)=>void;
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>init.method==='POST'?json({rosters:[{class_id:'U15A-03',revision:2,members:[]}]}):new Promise<Response>(resolve=>{finish=resolve;})));
  const refresh=api.refreshAcademic();await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
  await api.saveCloudRosters({'U15A-03':[]},{'U15A-03':[member]});finish(json(snapshot()));await refresh;
  expect(api.cloudSnapshot().rosters[0].revision).toBe(2);expect(api.cloudSnapshot().rosters[0].members).toEqual([]);
});
it('responses from a previous logged-in account are discarded',async()=>{
  let finish!:(r:Response)=>void;vi.stubGlobal('fetch',vi.fn(async()=>new Promise<Response>(resolve=>{finish=resolve;})));
  api.startAcademicCloud(user);const task=api.refreshAcademic();await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));api.startAcademicCloud(null);finish(json(snapshot()));await task;
  expect(api.getAcademicState().account).toBe('');expect(api.getAcademicState().snapshot).toBeNull();
});
it('exports original local attendance without changing IDs or deleting any legacy key',()=>{
  memory.set('makexrank-class-members-v1',JSON.stringify({'U15A-03':[member]}));
  const record={rows:[],savedAt:'2026-01-01T00:00:00Z',phase:'draft'};
  memory.set('makexrank-attendance-v1:2026-01-01:U15A-03:extra1',JSON.stringify(record));
  const result=api.localAcademicMigration();expect(result.rosters['U15A-03']).toEqual([member]);expect(result.attendance[0].session).toBe('extra1');expect(memory.size).toBe(2);
  expect(api.parseAcademicMigration(JSON.stringify(result))).toEqual(result);expect(()=>api.parseAcademicMigration('{"rosters":[]}')).toThrow();
});
it('corrupt account caches are not displayed or treated as an empty writable roster',async()=>{
  memory.set('makexrank-academic-cache-v1:http://fixture.test/api:fixture-admin','{"permissions":null}');
  vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline');}));await connect();
  expect(api.getAcademicState().snapshot).toBeNull();expect(api.getAcademicState().phase).toBe('error');expect(()=>api.cloudSnapshot()).toThrow('offline');
});
it('a browser cache quota error cannot turn a confirmed server commit into a failed save',async()=>{
  await connect();vi.stubGlobal('fetch',vi.fn(async()=>json({rosters:[{class_id:'U15A-03',revision:2,members:[]}]})));
  vi.stubGlobal('localStorage',{getItem:(k:string)=>memory.get(k)??null,setItem:()=>{throw new Error('quota');}});
  await expect(api.saveCloudRosters({'U15A-03':[]},{'U15A-03':[member]})).resolves.toEqual({'U15A-03':[]});expect(api.getAcademicState().message).toBe('');expect(api.cloudSnapshot().rosters[0].revision).toBe(2);
});
it('makeup saves round-trip per leave identity with revision protection and retain the attendance snapshot',async()=>{
  await connect();
  const source={classId:'U15A-03',date:'2026-10-24',session:'regular',memberId:member.id};
  const plan={status:'scheduled' as const,date:'2026-10-28',startTime:'13:00',endTime:'15:00'};
  const saved={class_id:source.classId,date:source.date,session:source.session,member_id:source.memberId,revision:1,plan,actor:'supergary',updatedAt:'2026-10-20T06:00:00Z'};
  const fetch=vi.fn(async(url:string,init:RequestInit)=>{expect(url).toContain('/makeups/U15A-03/2026-10-24/regular/fixture-member');expect(JSON.parse(init.body as string)).toEqual({revision:0,plan});return json(saved);});vi.stubGlobal('fetch',fetch);
  await expect(api.saveCloudMakeup(source,plan,0)).resolves.toEqual(saved);expect(api.cloudSnapshot().makeups).toEqual([saved]);expect(api.cloudSnapshot().attendance).toEqual([]);
  await expect(api.saveCloudMakeup(source,plan,0)).rejects.toThrow('更新');expect(fetch).toHaveBeenCalledTimes(1);
});
it('failed makeup saves preserve the old plan and a recoverable draft without reporting success',async()=>{
  await connect();vi.stubGlobal('fetch',vi.fn(async()=>json({message:'Conflict'},409)));
  await expect(api.saveCloudMakeup({classId:'U15A-03',date:'2026-10-24',session:'regular',memberId:member.id},{status:'waived',date:'',startTime:'',endTime:''},0)).rejects.toThrow('Conflict');
  expect(api.cloudSnapshot().makeups ?? []).toEqual([]);expect(Object.keys(api.unsavedAcademicChanges())[0]).toContain('/makeups/');
});
