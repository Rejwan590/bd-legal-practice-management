import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import {
  ChamberBackupMetadata,
  RestoreMode,
  RestorePreview,
  RestoreResult,
} from '../../data/types';
import {
  Download,
  Upload,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,
  FileCheck,
  AlertTriangle,
  Database,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FolderArchive,
  Briefcase,
  Users,
  Gavel,
  CheckSquare,
  Clock,
  Sparkles,
} from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';

export const BackupScreen: React.FC = () => {
  const { t } = useTranslation();
  const { currentUser, currentFirm, can, refreshState, isReadOnly } = useAuth();
  const repos = getRepositories();

  const canExport = can('data.export');
  const canRestore = can('settings.manage');

  // Export State
  const [encryptExport, setEncryptExport] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportPasswordConfirm, setExportPasswordConfirm] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Restore State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [decryptPassword, setDecryptPassword] = useState('');
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('clean');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canExport) return;

    if (encryptExport) {
      if (!exportPassword) {
        setExportError(t('backup.passwordRequired'));
        return;
      }
      if (exportPassword !== exportPasswordConfirm) {
        setExportError(t('backup.passwordMismatch'));
        return;
      }
    }

    setExportLoading(true);
    setExportError(null);
    setExportSuccess(null);

    try {
      const securityContext = { currentUser };
      const backup = await repos.backup.createBackup(securityContext, {
        password: encryptExport ? exportPassword : undefined,
      });

      // Trigger file download
      const blob = new Blob([backup.jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = backup.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportSuccess(
        `${t('backup.exportSuccess')} (${backup.filename}, SHA-256: ${backup.checksum.slice(0, 12)}...)`
      );
      setExportPassword('');
      setExportPasswordConfirm('');
      setEncryptExport(false);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setPreview(null);
    setRestoreError(null);
    setRestoreResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content);
      // Auto inspect if unencrypted
      tryInspect(content);
    };
    reader.readAsText(file);
  };

  const tryInspect = async (content: string, password?: string) => {
    setInspectLoading(true);
    setRestoreError(null);
    try {
      const securityContext = { currentUser };
      const previewData = await repos.backup.inspectBackup(securityContext, content, password);
      setPreview(previewData);
      if (previewData.error && !previewData.isEncrypted) {
        setRestoreError(previewData.error);
      }
    } catch (err: unknown) {
      setRestoreError(err instanceof Error ? err.message : 'Failed to inspect backup file');
    } finally {
      setInspectLoading(false);
    }
  };

  const handleInspectWithPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileContent) return;
    tryInspect(fileContent, decryptPassword);
  };

  const handleExecuteRestore = async () => {
    if (!fileContent || !canRestore) return;

    if (isReadOnly) {
      setRestoreError(t('subscription.readOnlyBlockedAction'));
      return;
    }

    setRestoreLoading(true);
    setRestoreError(null);
    setRestoreResult(null);

    try {
      const securityContext = { currentUser };
      const result = await repos.backup.restoreBackup(securityContext, fileContent, {
        password: decryptPassword || undefined,
        mode: restoreMode,
      });

      setRestoreResult(result);
      setConfirmModalOpen(false);
      await refreshState();
    } catch (err: unknown) {
      setRestoreError(err instanceof Error ? err.message : 'Restore execution failed');
      setConfirmModalOpen(false);
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto w-full pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Database className="w-6 h-6 text-indigo-700" />
            {t('backup.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('backup.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Chamber: <span className="font-bold">{currentFirm?.name}</span>
          </span>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
              currentUser.role === 'Owner'
                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                : 'bg-blue-100 text-blue-800 border border-blue-200'
            }`}
          >
            {currentUser.role}
          </span>
        </div>
      </div>

      {/* Main Grid: Export and Restore */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Export Column */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{t('backup.exportTitle')}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{t('backup.exportSubtitle')}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleExport} className="p-6 space-y-5">
              {/* Export Feature Details */}
              <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-2">
                <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5 uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  Tamper-Evident SHA-256 Architecture
                </span>
                <p className="text-xs text-indigo-800 leading-relaxed">
                  Every export generates a cryptographic SHA-256 checksum over your chamber's
                  master data and records an immutable audit log entry.
                </p>
              </div>

              {/* Password Encryption Toggle */}
              <div className="pt-2">
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition cursor-pointer">
                  <input
                    type="checkbox"
                    checked={encryptExport}
                    onChange={(e) => setEncryptExport(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-indigo-600" />
                      {t('backup.encryptCheckbox')}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Protects the export using 256-bit AES-GCM and PBKDF2 (100,000 iterations).
                    </p>
                  </div>
                </label>
              </div>

              {/* Password inputs if encryption selected */}
              {encryptExport && (
                <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200 animate-fadeIn">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      {t('backup.passwordPlaceholder')}
                    </label>
                    <input
                      type="password"
                      value={exportPassword}
                      onChange={(e) => setExportPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full text-xs px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      required={encryptExport}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      {t('backup.passwordConfirmPlaceholder')}
                    </label>
                    <input
                      type="password"
                      value={exportPasswordConfirm}
                      onChange={(e) => setExportPasswordConfirm(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full text-xs px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      required={encryptExport}
                    />
                  </div>
                </div>
              )}

              {/* Feedback Messages */}
              {exportError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{exportError}</span>
                </div>
              )}

              {exportSuccess && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{exportSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={exportLoading || !canExport}
                className="w-full py-3 px-4 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold shadow-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {exportLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('backup.exporting')}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>{t('backup.exportButton')}</span>
                  </>
                )}
              </button>

              {!canExport && (
                <p className="text-[11px] text-center text-amber-700">
                  Permission required: <code>data.export</code> (Contact Chamber Owner)
                </p>
              )}
            </form>
          </div>
        </div>

        {/* Restore Column */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{t('backup.restoreTitle')}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{t('backup.restoreSubtitle')}</p>
                </div>
              </div>
              {isReadOnly && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                  <Lock className="w-3 h-3" /> {t('common.readOnlyLocked')}
                </span>
              )}
            </div>

            <div className="p-6 space-y-5">
              {/* File Upload Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-6 border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl text-center bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-600 mx-auto transition" />
                <p className="text-xs font-semibold text-slate-700 mt-2">
                  {selectedFile ? selectedFile.name : t('backup.dropzone')}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                    : 'Supports .json & password-encrypted .enc.json'}
                </p>
              </div>

              {/* Password prompt for encrypted backups */}
              {preview?.isEncrypted && !preview.metadata && (
                <form
                  onSubmit={handleInspectWithPassword}
                  className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <Lock className="w-4 h-4 text-amber-700" />
                    <span>{t('backup.decryptPasswordPrompt')}</span>
                  </div>
                  <input
                    type="password"
                    value={decryptPassword}
                    onChange={(e) => setDecryptPassword(e.target.value)}
                    placeholder={t('backup.decryptPasswordPlaceholder')}
                    className="w-full text-xs min-h-[44px] px-3.5 py-2.5 bg-white rounded-lg border border-amber-300 focus:ring-2 focus:ring-amber-500"
                    required
                  />
                  <button
                    type="submit"
                    disabled={inspectLoading}
                    className="w-full min-h-[44px] py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2"
                  >
                    {inspectLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Key className="w-4 h-4" />
                    )}
                    <span>{t('backup.decryptButton')}</span>
                  </button>
                </form>
              )}

              {/* Inspected Preview Card */}
              {preview && preview.metadata && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-emerald-600" />
                      {t('backup.snapshotDetails')}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        preview.checksumMatched
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {preview.checksumMatched ? 'Checksum Verified' : 'Checksum Failed'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">
                        {t('backup.sourceFirm')}
                      </span>
                      <span className="font-semibold text-slate-800 truncate block">
                        {preview.metadata.firmName}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">
                        {t('backup.exportedAt')}
                      </span>
                      <span className="font-semibold text-slate-800">
                        {new Date(preview.metadata.exportedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">
                        {t('backup.exportedBy')}
                      </span>
                      <span className="font-semibold text-slate-800">
                        {preview.metadata.exportedByName}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">
                        Encryption
                      </span>
                      <span className="font-semibold text-slate-800">
                        {preview.isEncrypted ? 'AES-GCM-256' : 'Plain JSON'}
                      </span>
                    </div>
                  </div>

                  {/* Record Counts Chips */}
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                      {t('backup.countsSummary')}:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-medium">
                        {preview.metadata.counts.cases} Cases
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-medium">
                        {preview.metadata.counts.clients} Clients
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-medium">
                        {preview.metadata.counts.hearings} Hearings
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-medium">
                        {preview.metadata.counts.tasks} Tasks
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-medium">
                        {preview.metadata.counts.physicalFiles} Physical Files
                      </span>
                    </div>
                  </div>

                  {/* Warnings if any */}
                  {preview.warnings.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 space-y-1">
                      {preview.warnings.map((w, idx) => (
                        <p key={idx} className="flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Restore Mode Radio Options */}
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <span className="text-xs font-bold text-slate-800 block">
                      Select Restore Strategy:
                    </span>
                    <label className="flex items-start gap-2.5 min-h-[44px] p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                      <input
                        type="radio"
                        name="restoreMode"
                        value="clean"
                        checked={restoreMode === 'clean'}
                        onChange={() => setRestoreMode('clean')}
                        className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          {t('backup.restoreModeClean')}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {t('backup.restoreModeCleanDesc')}
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 min-h-[44px] p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                      <input
                        type="radio"
                        name="restoreMode"
                        value="merge"
                        checked={restoreMode === 'merge'}
                        onChange={() => setRestoreMode('merge')}
                        className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          {t('backup.restoreModeMerge')}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {t('backup.restoreModeMergeDesc')}
                        </span>
                      </div>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => setConfirmModalOpen(true)}
                    disabled={!preview.valid || !canRestore}
                    className="w-full min-h-[44px] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Proceed to Restore</span>
                  </button>
                </div>
              )}

              {/* Restore Result Success */}
              {restoreResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 animate-fadeIn">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{t('backup.restoreSuccess')}</span>
                  </div>
                  <p className="text-xs text-emerald-800">{restoreResult.message}</p>
                  <span className="text-[11px] text-emerald-700 block font-mono">
                    Audit Log Entry ID: {restoreResult.auditLogId}
                  </span>
                </div>
              )}

              {/* Restore Error Message */}
              {restoreError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{restoreError}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ResponsiveModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title={t('backup.restoreConfirmTitle')}
        icon={AlertTriangle}
        maxWidth="md"
        footer={
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 w-full">
            <button
              type="button"
              onClick={() => setConfirmModalOpen(false)}
              disabled={restoreLoading}
              className="min-h-[44px] px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition flex items-center justify-center"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExecuteRestore}
              disabled={restoreLoading}
              className="min-h-[44px] px-4 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs flex items-center justify-center gap-2"
            >
              {restoreLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{t('backup.restoring')}</span>
                </>
              ) : (
                <span>{t('backup.restoreButton')}</span>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            {t('backup.restoreConfirmWarning')}
          </p>

          <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 space-y-1 border border-slate-200">
            <p>
              <strong>Mode:</strong> {restoreMode === 'clean' ? 'Clean Replace' : 'Safe Merge'}
            </p>
            <p>
              <strong>Records:</strong> {preview?.metadata?.counts.cases} cases,{' '}
              {preview?.metadata?.counts.clients} clients,{' '}
              {preview?.metadata?.counts.hearings} hearings.
            </p>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
};
