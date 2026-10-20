import {WORKSPACE_NAME} from './workspaceBrand';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const INSTALL_READY_EVENT = 'makexrank:pwa-install-ready';
const ACTIVE_BUILD_KEY = 'makexrank-active-build';
const PUBLIC_COACH_URL = 'https://81.70.62.5/MakeXRank/#view=coach-workbench';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedThisVisit = false;
let registered = false;

export type InstallDevice = 'ios' | 'android' | 'desktop';

export function getPwaInstallEnvironment() {
  const userAgent = window.navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && window.navigator.maxTouchPoints > 1);
  return {
    device: (ios ? 'ios' : /Android/i.test(userAgent) ? 'android' : 'desktop') as InstallDevice,
    wechat: /MicroMessenger|wxwork/i.test(userAgent),
  };
}

export function isStandalonePwa(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && Boolean(window.navigator.standalone));
}

export function canPromptPwaInstall(): boolean {
  return Boolean(deferredPrompt) && !isPwaInstalled();
}

export function isPwaInstalled(): boolean {
  return installedThisVisit || isStandalonePwa();
}

export function getPwaLaunchUrl(): string {
  const {protocol, hostname, origin} = window.location;
  return protocol === 'https:' && hostname !== 'localhost' && hostname !== '127.0.0.1'
    ? `${origin}/MakeXRank/#view=coach-workbench`
    : PUBLIC_COACH_URL;
}

export function getPwaInstallGuide(device = getPwaInstallEnvironment().device) {
  const wechat = getPwaInstallEnvironment().wechat;
  const browserStep = wechat
    ? '先点微信右上角“…”→“在浏览器打开”；找不到时，复制下方入口链接到浏览器。'
    : '如果当前在微信或其他应用内，请先复制下方入口链接到浏览器。';

  if (device === 'ios') {
    return {
      title: '苹果手机 / iPad：用 Safari 添加',
      description: '网页按钮不能代替 Safari 完成添加，需要在浏览器的分享菜单中确认。',
      steps: [browserStep, '用 Safari 打开下方工作台入口，点击“分享”（方框向上箭头；部分版本需先打开页面菜单）。', '在分享列表中向下滑，选择“添加到主屏幕”；若没有，点“编辑操作”查找。', `如果出现“作为网页 App 打开”，保持开启，再点“添加”。回到手机桌面查找“${WORKSPACE_NAME}”。`],
    };
  }

  if (device === 'android') {
    return {
      title: '安卓手机：用浏览器安装或添加快捷方式',
      description: '只有浏览器提供安装能力时，页面才能弹出系统安装确认；否则按菜单添加。',
      steps: [browserStep, '用 Chrome、Edge 或支持桌面快捷方式的手机浏览器打开下方入口。', '点击浏览器右上角菜单，查找“安装应用”“添加到主屏幕”或“安装并创建快捷方式”。', `按系统提示确认，并回到桌面查找“${WORKSPACE_NAME}”。没有这些菜单时，请换用 Chrome 或 Edge；若系统拦截快捷方式，请检查该浏览器的桌面快捷方式权限。`],
    };
  }

  return {
    title: '电脑：用 Chrome 或 Edge 安装',
    description: '当前没有收到浏览器的安装许可，不能由网页直接创建桌面图标。',
    steps: ['复制下方工作台入口，在 Chrome 或 Edge 中打开。', '查找地址栏的安装图标，或浏览器菜单中的“安装应用 / 将此网站作为应用安装”。', `按浏览器提示确认。安装后在桌面或系统应用列表中查找“${WORKSPACE_NAME}”。`],
  };
}

export function getPwaInstallInstructions(): string[] {
  return getPwaInstallGuide().steps;
}

export async function requestPwaInstall(): Promise<'accepted' | 'dismissed' | 'manual' | 'standalone'> {
  if (isPwaInstalled()) {
    return 'standalone';
  }

  if (!deferredPrompt) {
    return 'manual';
  }

  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  window.dispatchEvent(new CustomEvent(INSTALL_READY_EVENT));
  await promptEvent.prompt(); // Must run directly inside the user's click gesture.
  const choice = await promptEvent.userChoice;
  return choice.outcome;
}

export function registerPwaFeatures(): void {
  if (registered) return;
  registered = true;

  // Capture actual browser capability, including desktop Chromium. Do not persist
  // an "installed" flag: it would incorrectly block reinstall after app removal.
  window.addEventListener('beforeinstallprompt', (event) => {
    if (isStandalonePwa()) return;
    event.preventDefault();
    installedThisVisit = false;
    deferredPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent(INSTALL_READY_EVENT));
  });
  window.addEventListener('appinstalled', () => {
    installedThisVisit = true;
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent(INSTALL_READY_EVENT));
  });

  if (!('serviceWorker' in window.navigator)) {
    return;
  }

  if (import.meta.env.DEV) {
    window.addEventListener('load', () => {
      void Promise.all([
        window.navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        ),
        'caches' in window
          ? window.caches.keys().then((keys) =>
              Promise.all(keys.filter((key) => key.startsWith('makexrank-')).map((key) => window.caches.delete(key))),
            )
          : Promise.resolve([]),
      ]).then(() => {
        if (window.navigator.serviceWorker.controller && window.sessionStorage.getItem('makexrank-dev-cache-cleared') !== '1') {
          window.sessionStorage.setItem('makexrank-dev-cache-cleared', '1');
          window.location.reload();
        }
      });
    });
  }

  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      const buildId = import.meta.env.VITE_BUILD_ID || 'production';
      const previousBuildId = window.localStorage.getItem(ACTIVE_BUILD_KEY);
      window.localStorage.setItem(ACTIVE_BUILD_KEY, buildId);
      let isReloadingForUpdate = false;
      window.navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (isReloadingForUpdate) return;
        isReloadingForUpdate = true;
        window.location.reload();
      });

      window.navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(buildId)}`,
        { updateViaCache: 'none' },
      )
        .then((registration) => {
          const checkForUpdate = () => void registration.update().catch(() => undefined);
          checkForUpdate();

          if (previousBuildId && previousBuildId !== buildId && 'caches' in window) {
            void window.caches.keys()
              .then((keys) => Promise.all(
                keys.filter((key) => key.startsWith('makexrank-')).map((key) => window.caches.delete(key)),
              ));
          }

          window.setInterval(checkForUpdate, 5 * 60 * 1000);
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') checkForUpdate();
          });
        })
        .catch(() => {
          // The app remains usable if browser policy blocks service worker registration.
        });
    });
  }

}

export { INSTALL_READY_EVENT };
