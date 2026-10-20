import {afterEach, beforeEach, expect, it, vi} from 'vitest';

let api:typeof import('./pwaInstall');
let events:EventTarget;
let standalone:boolean;
let navigatorInfo:{userAgent:string;maxTouchPoints:number};
let location:{protocol:string;hostname:string;origin:string};
let memory:Map<string,string>;

const desktop='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36';
const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const promptEvent=(outcome:'accepted'|'dismissed'='accepted',prompt=vi.fn(async()=>{}))=>Object.assign(new Event('beforeinstallprompt',{cancelable:true}),{prompt,userChoice:Promise.resolve({outcome,platform:'web'})});

beforeEach(async()=>{
  vi.resetModules();
  standalone=false;events=new EventTarget();memory=new Map();
  navigatorInfo={userAgent:desktop,maxTouchPoints:0};
  location={protocol:'https:',hostname:'club.example',origin:'https://club.example'};
  vi.stubGlobal('window',Object.assign(events,{navigator:navigatorInfo,location,localStorage:{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>memory.set(key,value)},matchMedia:()=>({matches:standalone})}));
  api=await import('./pwaInstall');
});
afterEach(()=>vi.unstubAllGlobals());

it('without an actual browser event, installation remains manual and never reports success',async()=>{
  api.registerPwaFeatures();expect(api.canPromptPwaInstall()).toBe(false);
  expect(await api.requestPwaInstall()).toBe('manual');expect(api.isPwaInstalled()).toBe(false);
});

it('captures desktop installation capability even without service-worker access',async()=>{
  api.registerPwaFeatures();const event=promptEvent();events.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);expect(api.canPromptPwaInstall()).toBe(true);
  expect(await api.requestPwaInstall()).toBe('accepted');expect(event.prompt).toHaveBeenCalledOnce();
  expect(api.isPwaInstalled()).toBe(false); // Browser acceptance is not proof that an icon exists.
});

it('notifies mounted controls when a late browser prompt becomes available and after consumption',async()=>{
  api.registerPwaFeatures();const ready=vi.fn();events.addEventListener(api.INSTALL_READY_EVENT,ready);
  events.dispatchEvent(promptEvent());expect(ready).toHaveBeenCalledTimes(1);
  await api.requestPwaInstall();expect(ready).toHaveBeenCalledTimes(2);expect(api.canPromptPwaInstall()).toBe(false);
});

it('never reuses a consumed prompt, including concurrent button clicks',async()=>{
  api.registerPwaFeatures();const event=promptEvent();events.dispatchEvent(event);
  const first=api.requestPwaInstall();expect(event.prompt).toHaveBeenCalledOnce();
  expect(await api.requestPwaInstall()).toBe('manual');expect(await first).toBe('accepted');
});

it('a dismissed installation is not success and a later real event can be retried',async()=>{
  api.registerPwaFeatures();events.dispatchEvent(promptEvent('dismissed'));
  expect(await api.requestPwaInstall()).toBe('dismissed');expect(api.isPwaInstalled()).toBe(false);
  events.dispatchEvent(promptEvent());expect(await api.requestPwaInstall()).toBe('accepted');
});

it('a failed browser prompt is discarded so the UI can fall back to instructions',async()=>{
  api.registerPwaFeatures();events.dispatchEvent(promptEvent('accepted',vi.fn(async()=>{throw new Error('Browser denied installation');})));
  await expect(api.requestPwaInstall()).rejects.toThrow('Browser denied');expect(api.canPromptPwaInstall()).toBe(false);
  expect(await api.requestPwaInstall()).toBe('manual');
});

it('only appinstalled or standalone mode marks installation; no permanent flag blocks reinstall',async()=>{
  memory.set('makexrank-pwa-install-dismissed','1');api.registerPwaFeatures();events.dispatchEvent(promptEvent());
  expect(api.canPromptPwaInstall()).toBe(true);
  events.dispatchEvent(new Event('appinstalled'));expect(api.isPwaInstalled()).toBe(true);expect(api.canPromptPwaInstall()).toBe(false);
  expect(await api.requestPwaInstall()).toBe('standalone');
  events.dispatchEvent(promptEvent());expect(api.isPwaInstalled()).toBe(false);expect(api.canPromptPwaInstall()).toBe(true);
});

it('already standalone never offers another installation prompt',async()=>{
  standalone=true;api.registerPwaFeatures();const event=promptEvent();events.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);expect(api.canPromptPwaInstall()).toBe(false);
  expect(await api.requestPwaInstall()).toBe('standalone');expect(event.prompt).not.toHaveBeenCalled();
});

it('registration is idempotent and does not duplicate capability notifications',()=>{
  api.registerPwaFeatures();api.registerPwaFeatures();const ready=vi.fn();events.addEventListener(api.INSTALL_READY_EVENT,ready);
  events.dispatchEvent(promptEvent());expect(ready).toHaveBeenCalledOnce();
});

it('iPhone and iPad desktop-mode UAs receive Safari share-sheet steps',()=>{
  navigatorInfo.userAgent=iphone;expect(api.getPwaInstallEnvironment().device).toBe('ios');
  expect(api.getPwaInstallInstructions().join(' ')).toContain('添加到主屏幕');
  navigatorInfo.userAgent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)';navigatorInfo.maxTouchPoints=5;
  expect(api.getPwaInstallEnvironment().device).toBe('ios');expect(api.getPwaInstallGuide().description).toContain('不能代替 Safari');
});

it('WeChat on either phone platform explains how to leave the embedded browser',()=>{
  for(const userAgent of [iphone+' MicroMessenger/8.0', 'Mozilla/5.0 (Linux; Android 14) MicroMessenger/8.0']) {
    navigatorInfo.userAgent=userAgent;expect(api.getPwaInstallEnvironment().wechat).toBe(true);
    expect(api.getPwaInstallGuide().steps[0]).toContain('微信右上角');expect(api.getPwaInstallGuide().steps[0]).toContain('复制下方入口');
  }
  expect(api.getPwaInstallGuide().title).toContain('安卓');
});

it('manual device selection is available independently of user-agent detection',()=>{
  expect(api.getPwaInstallGuide('ios').title).toContain('Safari');expect(api.getPwaInstallGuide('android').title).toContain('安卓');
  expect(api.getPwaInstallGuide('desktop').title).toContain('电脑');
});

it('launch link is a stable credential-free deep link, and localhost never gets shared to phones',()=>{
  expect(api.getPwaLaunchUrl()).toBe('https://club.example/MakeXRank/#view=coach-workbench');
  location.protocol='http:';location.hostname='127.0.0.1';location.origin='http://127.0.0.1:5174';
  expect(api.getPwaLaunchUrl()).toBe('https://81.70.62.5/MakeXRank/#view=coach-workbench');
});
