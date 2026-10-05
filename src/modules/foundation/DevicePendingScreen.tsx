import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building,
  Globe,
  Clock,
  Laptop,
  ArrowLeft,
  RefreshCw,
  Info,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';

interface DevicePendingScreenProps {
  email: string;
  deviceName?: string;
  onRetry: () => Promise<{ success: boolean; error?: string; code?: string }>;
  onBackToLogin: () => void;
}

export const DevicePendingScreen: React.FC<DevicePendingScreenProps> = ({
  email,
  deviceName,
  onRetry,
  onBackToLogin,
}) => {
  const { t, i18n } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'en' ? 'bn' : 'en';
    i18n.changeLanguage(nextLang);
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    setFeedback(null);
    try {
      const res = await onRetry();
      if (!res.success) {
        if (res.code === 'DEVICE_PENDING') {
          setFeedback(t('devices.statusPending', { defaultValue: 'Approval is still pending with administrator.' }));
        } else if (res.code === 'DEVICE_REJECTED') {
          setFeedback(t('devices.deviceRejected', { defaultValue: 'This device has been rejected.' }));
        } else if (res.code === 'DEVICE_REVOKED') {
          setFeedback(t('devices.deviceRevoked', { defaultValue: 'This device authorization was revoked.' }));
        } else {
          setFeedback(res.error || 'Verification failed. Please try again.');
        }
      } else {
        setFeedback(t('devices.deviceApprovedNotice', { defaultValue: 'Device approved! Logging in...' }));
      }
    } catch {
      setFeedback('Failed to reach server. Please check your network.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-900 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 pt-safe pb-safe selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-serif font-bold text-xl shadow-lg">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight leading-tight">
              {t('app.chamberName', { defaultValue: 'Rahman & Associates Chambers' })}
            </h1>
            <p className="text-xs text-slate-400 font-medium hidden sm:block">
              {t('app.subtitle', { defaultValue: 'Chamber Legal Practice Management System' })}
            </p>
          </div>
        </div>

        {/* Language Switcher */}
        <button
          onClick={toggleLanguage}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition min-h-[44px]"
          title="Toggle language"
        >
          <Globe className="w-4 h-4 text-slate-400" />
          <span className={i18n.language === 'en' ? 'font-bold text-white' : 'text-slate-400'}>EN</span>
          <span className="text-slate-500">/</span>
          <span className={i18n.language === 'bn' ? 'font-bold text-white font-bengali' : 'text-slate-400 font-bengali'}>
            বাংলা
          </span>
        </button>
      </header>

      {/* Main Card */}
      <main className="w-full max-w-lg mx-auto my-auto py-6">
        <div className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Header Icon & Title */}
          <div className="text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2">
                <Clock className="w-3.5 h-3.5" />
                {t('devices.statusPending', { defaultValue: 'Approval Pending' })}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {t('devices.waitingApprovalTitle', { defaultValue: 'Waiting for Device Approval' })}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                {t('devices.waitingApprovalSubtitle', {
                  defaultValue: 'This browser install requires authorization by your chamber administrator before accessing chamber files.',
                })}
              </p>
            </div>
          </div>

          {/* Device & User Info Box */}
          <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>Account:</span>
              <span className="text-slate-200 font-medium font-mono">{email}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>{t('devices.browserSummary', { defaultValue: 'Detected Browser' })}:</span>
              <span className="text-slate-200 font-medium flex items-center gap-1">
                <Laptop className="w-3.5 h-3.5 text-indigo-400" />
                {deviceName || 'Web Browser'}
              </span>
            </div>
          </div>

          {/* Explanation Text */}
          <p className="text-xs text-slate-300 leading-relaxed">
            {t('devices.explanation', {
              defaultValue:
                'To protect client privilege and sensitive legal records, every device accessing this chamber must be authorized. Please inform your chamber administrator to approve this device from the administration dashboard.',
            })}
          </p>

          {/* Honest Notice Callout */}
          <div className="p-3 bg-slate-900/60 border border-slate-700/50 rounded-xl flex items-start gap-2.5 text-[11px] text-slate-400">
            <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              {t('devices.honestNotice', {
                defaultValue:
                  "Note: A 'device' is a specific browser installation identified by a secure random key, not physical hardware. Clearing browser cookies or cache will register as a new device requiring re-authorization.",
              })}
            </span>
          </div>

          {/* Status Feedback Message */}
          {feedback && (
            <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl text-xs flex items-center gap-2 text-amber-300">
              <Info className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{feedback}</span>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 min-h-[44px]"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              {checking
                ? 'Verifying...'
                : t('devices.checkStatus', { defaultValue: 'Check Approval Status' })}
            </button>

            <button
              onClick={onBackToLogin}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('devices.backToLogin', { defaultValue: 'Back to Login' })}
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-slate-500">
        BD Legal Practice Management Platform • Secure Law Chamber Portal
      </footer>
    </div>
  );
};
