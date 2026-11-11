import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import i18n from '../locales/i18n';
import { clearChunkReloadGuard, isChunkLoadError } from '../utils/lazyWithRetry';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI Error caught by ErrorBoundary:', error, errorInfo);
  }

  public handleReset = () => {
    if (isChunkLoadError(this.state.error) && typeof window !== 'undefined') {
      clearChunkReloadGuard();
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      const isChunkError = isChunkLoadError(this.state.error);
      return (
        <div className="p-6 m-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 shadow-sm max-w-xl mx-auto my-12 animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1 min-w-0">
              <h3 className="text-base font-bold text-rose-950">
                {isChunkError
                  ? i18n.t('errors.newVersionTitle', 'Application update available')
                  : this.props.fallbackTitle || i18n.t('errors.sectionErrorTitle', 'Something went wrong rendering this section')}
              </h3>
              <p className="text-xs text-rose-700 font-mono break-words bg-rose-100/70 p-2.5 rounded-lg border border-rose-200">
                {isChunkError
                  ? i18n.t(
                      'errors.chunkLoadHint',
                      'A newer version of this application was deployed. Please reload the page to load the latest files.'
                    )
                  : this.state.error?.message || i18n.t('errors.unexpectedError', 'An unexpected runtime error occurred.')}
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer min-h-[44px]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {isChunkError
                      ? i18n.t('errors.reloadPage', 'Reload Page')
                      : i18n.t('errors.tryAgain', 'Try Again')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
