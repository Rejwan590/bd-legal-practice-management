import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import {
  Building,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Globe,
  UserCheck,
} from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'en' ? 'bn' : 'en';
    i18n.changeLanguage(nextLang);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage(t('auth.fieldsRequired', { defaultValue: 'Please enter both email and password.' }));
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const result = await login(email.trim(), password);
    setLoading(false);

    if (!result.success) {
      setErrorMessage(result.error || t('auth.loginFailed', { defaultValue: 'Invalid email or password.' }));
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setLoading(true);
    setErrorMessage(null);

    const result = await login(demoEmail, demoPass);
    setLoading(false);

    if (!result.success) {
      setErrorMessage(result.error || t('auth.loginFailed', { defaultValue: 'Invalid email or password.' }));
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-900 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 pt-safe pb-safe selection:bg-indigo-500 selection:text-white">
      {/* Top Brand & Language Bar */}
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
          title="Toggle language (English / বাংলা)"
        >
          <Globe className="w-4 h-4 text-slate-400" />
          <span className={i18n.language === 'en' ? 'font-bold text-white' : 'text-slate-400'}>
            EN
          </span>
          <span className="text-slate-500">/</span>
          <span className={i18n.language === 'bn' ? 'font-bold text-white font-bengali' : 'text-slate-400 font-bengali'}>
            বাংলা
          </span>
        </button>
      </header>

      {/* Main Login Card */}
      <main className="w-full max-w-md mx-auto my-auto py-6">
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {t('auth.loginTitle', { defaultValue: 'Chamber Member Sign In' })}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              {t('auth.loginSubtitle', { defaultValue: 'Enter your credentials to access your chamber dashboard' })}
            </p>
          </div>

          {errorMessage && (
            <div className="bg-rose-950/80 border border-rose-800/80 rounded-xl p-3.5 flex items-start gap-3 text-rose-200 text-xs sm:text-sm leading-relaxed animate-in fade-in">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="min-w-0">{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
                {t('auth.email', { defaultValue: 'Email Address' })}
              </label>
              <div className="relative flex items-center">
                <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="lawyer@firm.bd"
                  required
                  autoComplete="email"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-11 pr-4 py-3 text-base text-white placeholder:text-slate-500 transition min-h-[48px]"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
                {t('auth.password', { defaultValue: 'Password' })}
              </label>
              <div className="relative flex items-center">
                <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-11 pr-12 py-3 text-base text-white placeholder:text-slate-500 transition min-h-[48px]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-200 absolute right-1 rounded-lg"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{t('auth.signIn', { defaultValue: 'Sign In to Chamber' })}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Demo One-Click Sign In Options */}
          {import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true' && (
            <div className="pt-4 border-t border-slate-700/80 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block text-center">
                Quick Demo Access
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleDemoLogin(
                      import.meta.env.VITE_DEMO_OWNER_EMAIL || '',
                      import.meta.env.VITE_DEMO_OWNER_PASSWORD || ''
                    )
                  }
                  disabled={loading}
                  className="p-3 bg-slate-700/50 hover:bg-slate-700 active:bg-slate-600 rounded-xl border border-slate-600 text-left transition flex items-center gap-2.5 min-h-[50px]"
                >
                  <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold text-xs shrink-0">
                    MR
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">Adv. Mahbubur</div>
                    <div className="text-[10px] text-purple-400 uppercase font-semibold">Owner Demo</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleDemoLogin(
                      import.meta.env.VITE_DEMO_STAFF_EMAIL || '',
                      import.meta.env.VITE_DEMO_STAFF_PASSWORD || ''
                    )
                  }
                  disabled={loading}
                  className="p-3 bg-slate-700/50 hover:bg-slate-700 active:bg-slate-600 rounded-xl border border-slate-600 text-left transition flex items-center gap-2.5 min-h-[50px]"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                    NJ
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">Adv. Nusrat</div>
                    <div className="text-[10px] text-blue-400 uppercase font-semibold">Staff Demo</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer Info */}
      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-slate-500 py-2">
        <div className="flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>BD Legal Practice Management &bull; Bank-grade 256-bit encryption &bull; Single-tenant firm isolation</span>
        </div>
      </footer>
    </div>
  );
};
