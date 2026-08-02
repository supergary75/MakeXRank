type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const INSTALL_DISMISSED_KEY = 'makexrank-pwa-install-dismissed';
const INSTALL_READY_EVENT = 'makexrank:pwa-install-ready';

let deferredPrompt: BeforeInstallPromptEvent | null = null;

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}

export function isStandalonePwa(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && Boolean(window.navigator.standalone));
}

export function canPromptPwaInstall(): boolean {
  return Boolean(deferredPrompt);
}

export function getPwaInstallInstructions(): string[] {
  const userAgent = window.navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/i.test(userAgent);
  const isAndroid = /Android/i.test(userAgent);
  const isWechat = /MicroMessenger/i.test(userAgent);

  if (isWechat) {
    return [
      '在微信右上角点击“...”。',
      '选择“在浏览器打开”。',
      '打开后再用浏览器菜单选择“添加到主屏幕”或“安装应用”。',
    ];
  }

  if (isIos) {
    return [
      '请用 Safari 打开这个网页。',
      '点击底部分享按钮。',
      '选择“添加到主屏幕”，确认后桌面会出现 MakeXRank 图标。',
    ];
  }

  if (isAndroid) {
    return [
      '请用 Chrome 或 Edge 打开这个网页。',
      '点击右上角菜单。',
      '选择“安装应用”或“添加到主屏幕”。',
    ];
  }

  return [
    '请使用 Chrome、Edge 或 Safari 打开网页。',
    '在浏览器菜单中选择“安装应用”或“添加到主屏幕”。',
  ];
}

export async function requestPwaInstall(): Promise<'prompted' | 'manual' | 'standalone'> {
  if (isStandalonePwa()) {
    return 'standalone';
  }

  if (!deferredPrompt) {
    return 'manual';
  }

  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  await promptEvent.prompt();
  await promptEvent.userChoice;
  return 'prompted';
}

export function registerPwaFeatures(): void {
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
      window.navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
        // The app remains usable if browser policy blocks service worker registration.
      });
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    if (!isMobileDevice() || isStandalonePwa() || window.localStorage.getItem(INSTALL_DISMISSED_KEY) === '1') {
      return;
    }

    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent(INSTALL_READY_EVENT));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    window.dispatchEvent(new CustomEvent(INSTALL_READY_EVENT));
  });
}

export { INSTALL_READY_EVENT };
