type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const INSTALL_DISMISSED_KEY = 'makexrank-pwa-install-dismissed';

function isStandaloneApp(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && Boolean(window.navigator.standalone));
}

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}

function createInstallButton(onInstall: () => void, onDismiss: () => void): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('role', 'status');
  wrapper.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:16px',
    'z-index:9999',
    'display:flex',
    'gap:10px',
    'align-items:center',
    'max-width:min(360px,calc(100vw - 32px))',
    'padding:12px 14px',
    'border:1px solid rgba(248,250,252,.18)',
    'border-radius:18px',
    'background:linear-gradient(135deg,rgba(15,23,42,.94),rgba(7,16,31,.9))',
    'box-shadow:0 18px 48px rgba(0,0,0,.36)',
    'color:#f8fafc',
    'font-family:inherit',
    'backdrop-filter:blur(16px)',
  ].join(';');

  const text = document.createElement('span');
  text.textContent = '安装 KCLUB 内部APP到手机桌面';
  text.style.cssText = 'font-size:14px;line-height:1.35;font-weight:700';

  const install = document.createElement('button');
  install.type = 'button';
  install.textContent = '安装';
  install.style.cssText = [
    'border:0',
    'border-radius:999px',
    'padding:9px 14px',
    'background:linear-gradient(135deg,#f7d477,#c89435)',
    'color:#111827',
    'font-weight:900',
    'cursor:pointer',
  ].join(';');
  install.addEventListener('click', onInstall);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', '关闭安装提示');
  close.style.cssText = [
    'width:30px',
    'height:30px',
    'border:1px solid rgba(248,250,252,.2)',
    'border-radius:999px',
    'background:rgba(255,255,255,.06)',
    'color:#f8fafc',
    'font-size:20px',
    'line-height:1',
    'cursor:pointer',
  ].join(';');
  close.addEventListener('click', onDismiss);

  wrapper.append(text, install, close);
  return wrapper;
}

function showIosInstallHint(): void {
  if (!isMobileDevice() || isStandaloneApp() || window.localStorage.getItem(INSTALL_DISMISSED_KEY) === '1') {
    return;
  }

  const isIos = /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(window.navigator.userAgent);
  if (!isIos || !isSafari) {
    return;
  }

  const wrapper = createInstallButton(
    () => window.alert('在 Safari 底部点击“分享”，然后选择“添加到主屏幕”。'),
    () => {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
      wrapper.remove();
    },
  );
  document.body.appendChild(wrapper);
}

export function registerPwaFeatures(): void {
  if (!('serviceWorker' in window.navigator)) {
    return;
  }

  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      window.navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
        // The app remains usable if browser policy blocks service worker registration.
      });
    });
  }

  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  let installButton: HTMLDivElement | null = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    if (!isMobileDevice() || isStandaloneApp() || window.localStorage.getItem(INSTALL_DISMISSED_KEY) === '1') {
      return;
    }

    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;

    installButton?.remove();
    installButton = createInstallButton(
      async () => {
        if (!deferredPrompt) {
          return;
        }
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          installButton?.remove();
        }
        deferredPrompt = null;
      },
      () => {
        window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
        installButton?.remove();
        installButton = null;
      },
    );
    document.body.appendChild(installButton);
  });

  window.addEventListener('appinstalled', () => {
    installButton?.remove();
    installButton = null;
    deferredPrompt = null;
  });

  window.addEventListener('load', showIosInstallHint);
}
