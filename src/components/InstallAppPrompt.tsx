import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, Laptop, Download, Share, X, PlusSquare } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const InstallAppPrompt: React.FC<{
  className?: string;
  variant?: 'drawer' | 'card';
}> = ({ className = '', variant = 'drawer' }) => {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    // Check if app is already running as standalone PWA
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsStandalone(Boolean(isStandaloneMode));
    };

    checkStandalone();

    // Check device type
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent);
    const isMobileDevice = /android|iphone|ipad|ipod|mobile/i.test(userAgent);
    setIsIOS(isAppleDevice);
    setIsMobile(isMobileDevice);

    // Listen for beforeinstallprompt event (Chromium / Edge / Chrome on Windows, Mac, Linux, Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Do not show prompt if already running in standalone mode (desktop or mobile)
  if (isStandalone) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setShowIOSModal(true);
    } else {
      setShowIOSModal(true);
    }
  };

  const titleText = isMobile ? t('pwa.installApp') : t('pwa.installDesktop');
  const descText = isMobile ? t('pwa.installDesc') : t('pwa.installDesktopDesc');
  const DeviceIcon = isMobile ? Smartphone : Laptop;

  return (
    <>
      {variant === 'drawer' ? (
        <div className={`pt-3 border-t border-slate-100 ${className}`}>
          <button
            type="button"
            onClick={handleInstallClick}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-100 text-indigo-950 transition active:scale-[0.99] text-left group min-h-[44px] cursor-pointer"
            aria-label={titleText}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <DeviceIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-indigo-950 truncate">
                  {titleText}
                </p>
                <p className="text-[10px] text-indigo-700/80 truncate">
                  {descText}
                </p>
              </div>
            </div>
            <Download className="w-4 h-4 text-indigo-600 shrink-0 group-hover:translate-y-0.5 transition-transform" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer ${className}`}
        >
          <DeviceIcon className="w-4 h-4" />
          <span>{titleText}</span>
        </button>
      )}

      {/* iOS / General Install Guide Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setShowIOSModal(false)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl z-10 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <DeviceIcon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {isIOS ? t('pwa.iosTitle') : titleText}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs text-slate-700">
              {isIOS ? (
                <>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      1
                    </div>
                    <div className="pt-0.5">
                      <p className="font-semibold">{t('pwa.iosStep1')}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                        <Share className="w-3.5 h-3.5 text-indigo-600 inline" /> (Share icon at the bottom)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      2
                    </div>
                    <div className="pt-0.5">
                      <p className="font-semibold">{t('pwa.iosStep2')}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                        <PlusSquare className="w-3.5 h-3.5 text-indigo-600 inline" /> &apos;Add to Home Screen&apos;
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      3
                    </div>
                    <div className="pt-0.5">
                      <p className="font-semibold">{t('pwa.iosStep3')}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2 text-slate-600 text-xs leading-relaxed">
                  <p className="font-semibold text-slate-800">
                    To install on Windows or Mac:
                  </p>
                  <p>
                    Click the <strong>Install</strong> icon on the right side of your browser&apos;s address bar, or open the browser menu (⋮ or ⋯) and click <strong>&quot;Install Lawyers eChamber&quot;</strong>.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                {t('pwa.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
