import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'cryp3d-pwa-install-dismissed';

function dismissedAlready(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Private mode can block storage; hiding for this visit is enough.
  }
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
  return ios && safari;
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (dismissedAlready() || isStandalone()) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    if (isIosSafari()) setIosHint(true);

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (hidden || (!deferred && !iosHint)) return null;

  const dismiss = () => {
    rememberDismiss();
    setHidden(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === 'accepted') dismiss();
  };

  return (
    <div className="install-prompt" role="region" aria-label="安裝到主畫面">
      <p>
        {deferred
          ? '把生態腦圖裝到主畫面，下次可以像 App 一樣打開。'
          : '用 Safari 下方的分享按鈕，點「加入主畫面」，就能像 App 一樣打開。'}
      </p>
      <div className="install-prompt-actions">
        <button type="button" className="install-later" onClick={dismiss}>
          以後再說
        </button>
        {deferred ? (
          <button type="button" className="install-now" onClick={() => void install()}>
            安裝
          </button>
        ) : null}
      </div>
    </div>
  );
}
