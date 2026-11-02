import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle,
  XCircle,
  Activity,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { runAllHealthDiagnostics, TestResult } from './tests/index';

type DiagnosticState = 'running' | 'no-results' | 'error' | 'pass' | 'fail';

export const HealthScreen: React.FC = () => {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [runnerError, setRunnerError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setRunning(true);
    setRunnerError(null);
    try {
      const suiteResults = await runAllHealthDiagnostics();
      setResults(suiteResults);
      setLastRun(new Date());
    } catch (err) {
      console.error('Failed to run diagnostics:', err);
      setRunnerError(err instanceof Error ? err.message : 'Unknown runner error');
      setLastRun(new Date());
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const totalTests = results.length;
  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = totalTests - passedTests;

  let state: DiagnosticState = 'no-results';
  if (running) {
    state = 'running';
  } else if (runnerError) {
    state = 'error';
  } else if (totalTests === 0) {
    state = 'no-results';
  } else if (failedTests === 0) {
    state = 'pass';
  } else {
    state = 'fail';
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-slate-700 shrink-0" />
            <span>{t('health.title')}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('health.subtitle')}</p>
        </div>

        <button
          onClick={runDiagnostics}
          disabled={running}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold shadow-xs transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          <span>{t('common.runAgain')}</span>
        </button>
      </div>

      {/* Stage Banner */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div>
          <span className="text-xs uppercase tracking-widest font-semibold text-emerald-400 block">
            Current Build Phase
          </span>
          <h2 className="text-base font-bold mt-0.5">{t('backup.stage10Banner')}</h2>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            Stage 10: Chamber Subscription Licensing, License Lifecycles & Rule 8 Read-Only Enforcement Engine.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs px-3 py-1.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
            Stage 10 of 10 — Core Features Complete
          </span>
        </div>
      </div>

      {/* Summary Scorecard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              state === 'pass'
                ? 'bg-emerald-100 text-emerald-600'
                : state === 'fail'
                ? 'bg-rose-100 text-rose-600'
                : state === 'error'
                ? 'bg-amber-100 text-amber-600'
                : state === 'running'
                ? 'bg-indigo-100 text-indigo-600'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {state === 'pass' ? (
              <CheckCircle className="w-7 h-7" />
            ) : state === 'fail' ? (
              <XCircle className="w-7 h-7" />
            ) : state === 'error' ? (
              <AlertTriangle className="w-7 h-7" />
            ) : state === 'running' ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : (
              <HelpCircle className="w-7 h-7" />
            )}
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium block">
              {t('health.overallStatus')}
            </span>
            <span
              className={`text-base sm:text-lg font-bold ${
                state === 'pass'
                  ? 'text-emerald-700'
                  : state === 'fail'
                  ? 'text-rose-700'
                  : state === 'error'
                  ? 'text-amber-700'
                  : state === 'running'
                  ? 'text-indigo-700'
                  : 'text-slate-700'
              }`}
            >
              {state === 'pass'
                ? t('health.statePass')
                : state === 'fail'
                ? t('health.stateFail')
                : state === 'error'
                ? t('health.stateError')
                : state === 'running'
                ? t('health.stateRunning')
                : t('health.stateNoResults')}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xl shrink-0">
            {passedTests}
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium block">
              {t('health.passedCount')}
            </span>
            <span className="text-base sm:text-lg font-bold text-slate-800">
              {t('health.checksCount', { passed: passedTests, total: totalTests })}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl shrink-0 ${
              failedTests === 0
                ? 'bg-slate-100 text-slate-500'
                : 'bg-rose-100 text-rose-700'
            }`}
          >
            {failedTests}
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium block">
              {t('health.failedCount')}
            </span>
            <span
              className={`text-base sm:text-lg font-bold ${
                failedTests === 0 ? 'text-slate-700' : 'text-rose-700'
              }`}
            >
              {t('health.issuesCount', { count: failedTests })}
            </span>
          </div>
        </div>
      </div>

      {runnerError && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{t('health.stateError')}</p>
            <p className="mt-0.5 font-mono">{runnerError}</p>
          </div>
        </div>
      )}

      {lastRun && (
        <div className="text-xs text-slate-400 font-mono text-right">
          Last diagnostic run: {lastRun.toLocaleTimeString()}
        </div>
      )}

      {/* Diagnostics List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-600 shrink-0" />
            <span>{t('common.testResults')}</span>
          </h3>
          <span className="text-xs text-slate-500 font-mono">
            Architecture Contract: ARCHITECTURE.md
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {results.map((res) => (
            <div key={res.id} className="p-4 sm:p-5 hover:bg-slate-50/50 transition">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    {res.passed ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm text-slate-900">{res.name}</h4>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                        {res.category}
                      </span>
                    </div>
                    <p
                      className={`text-xs mt-1 leading-relaxed ${
                        res.passed ? 'text-slate-600' : 'text-rose-700 font-medium'
                      }`}
                    >
                      {res.message}
                    </p>
                    {res.details && (
                      <p className="text-[11px] text-slate-400 font-mono mt-1 break-all sm:break-normal">
                        {res.details}
                      </p>
                    )}
                  </div>
                </div>

                <div className="sm:text-right shrink-0 self-start sm:self-auto">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                      res.passed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {res.passed ? t('common.pass') : t('common.fail')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
