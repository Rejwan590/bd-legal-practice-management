import React, { useState, useEffect } from 'react';
import { FirmDetailResponse, LicenseEvent, Payment, Device } from '../types/adminTypes';
import { adminApi } from '../api/adminApi';
import { RenewModal } from './RenewModal';
import { LicenseModal } from './LicenseModal';
import { PaymentModal } from './PaymentModal';
import { ConfirmModal } from '../components/ConfirmModal';
import {
  ArrowLeft,
  Calendar,
  Laptop,
  Users,
  Clock,
  CreditCard,
  History,
  PauseCircle,
  PlayCircle,
  Ban,
  Trash2,
  RefreshCw,
  Sliders,
  CheckCircle,
  XCircle,
  Info,
} from 'lucide-react';

interface FirmDetailScreenProps {
  firmId: string;
  onBack: () => void;
}

export const FirmDetailScreen: React.FC<FirmDetailScreenProps> = ({ firmId, onBack }) => {
  const [data, setData] = useState<FirmDetailResponse | null>(null);
  const [licenseEvents, setLicenseEvents] = useState<LicenseEvent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeTab, setActiveTab] = useState<'license' | 'payments' | 'devices'>('license');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal States
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [isLicenseOpen, setIsLicenseOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  // Confirm Dialog States
  const [confirmAction, setConfirmAction] = useState<
    'suspend' | 'disable' | 'reactivate' | 'delete' | null
  >(null);
  const [deviceToRevoke, setDeviceToRevoke] = useState<Device | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchFirmDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const [detailRes, eventsRes, paymentsRes, devicesRes] = await Promise.all([
        adminApi.getFirm(firmId),
        adminApi.listLicenseEvents(firmId),
        adminApi.listPayments(firmId),
        adminApi.getFirmDevices(firmId),
      ]);
      setData(detailRes);
      setLicenseEvents(eventsRes);
      setPayments(paymentsRes);
      setDevices(devicesRes.devices);
    } catch (err: any) {
      setError(err?.message || 'Failed to load firm details.');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveDevice = async (deviceId: string) => {
    try {
      await adminApi.approveDevice(deviceId);
      await fetchFirmDetails();
    } catch (err: any) {
      alert(err?.message || 'Failed to approve device');
    }
  };

  const handleRejectDevice = async (deviceId: string) => {
    try {
      await adminApi.rejectDevice(deviceId);
      await fetchFirmDetails();
    } catch (err: any) {
      alert(err?.message || 'Failed to reject device');
    }
  };

  const handleRevokeDevice = async () => {
    if (!deviceToRevoke) return;
    setActionLoading(true);
    try {
      await adminApi.revokeDevice(deviceToRevoke.id);
      setDeviceToRevoke(null);
      await fetchFirmDetails();
    } catch (err: any) {
      alert(err?.message || 'Failed to revoke device authorization');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    fetchFirmDetails();
  }, [firmId]);

  if (loading) {
    return <div className="p-12 text-center text-slate-500 text-sm">Loading chamber firm details...</div>;
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Firm List
        </button>
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
          {error || 'Chamber firm not found.'}
        </div>
      </div>
    );
  }

  const { firm, plan, license, userCount, deviceCount, lastActivity } = data;

  const handleExecuteConfirm = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      if (confirmAction === 'suspend') {
        await adminApi.suspendFirm(firm.id);
      } else if (confirmAction === 'disable') {
        await adminApi.disableFirm(firm.id);
      } else if (confirmAction === 'reactivate') {
        await adminApi.reactivateFirm(firm.id);
      } else if (confirmAction === 'delete') {
        await adminApi.deleteFirm(firm.id, firm.name);
        onBack();
        return;
      }
      await fetchFirmDetails();
    } catch (err: any) {
      alert(err?.message || 'Action failed');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      expired: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      suspended: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      disabled: 'bg-slate-700/50 text-slate-400 border-slate-600',
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${map[status] || map.active}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top back button and firm title */}
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-slate-400 hover:text-white transition-colors mb-3 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Chamber Firms
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{firm.name}</h1>
              {statusBadge(firm.status)}
            </div>
            <div className="text-xs text-slate-400 font-mono">ID: {firm.firmId}</div>
            <div className="text-xs text-slate-300">
              {firm.officeAddress || 'No office address registered'}
              {firm.contact && ` • Phone: ${firm.contact}`}
            </div>
          </div>

          {/* Quick Actions Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsRenewOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold rounded-xl min-h-[44px] transition-colors shadow-lg shadow-indigo-600/20"
            >
              <RefreshCw className="w-4 h-4" /> Renew License
            </button>

            <button
              onClick={() => setIsLicenseOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium rounded-xl border border-slate-700 min-h-[44px] transition-colors"
            >
              <Sliders className="w-4 h-4" /> Adjust Limits
            </button>

            <button
              onClick={() => setIsPaymentOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-medium rounded-xl min-h-[44px] transition-colors shadow-lg shadow-emerald-600/20"
            >
              <CreditCard className="w-4 h-4" /> Record Payment
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>License Expiry</span>
            <Calendar className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-sm sm:text-base font-bold text-white font-mono">
            {new Date(firm.licenseExpiresAt).toLocaleDateString()}
          </div>
          <div className="text-[11px] text-slate-400">
            {license.isExpired ? (
              <span className="text-rose-400 font-semibold">Expired</span>
            ) : (
              <span className="text-emerald-400">Valid</span>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Devices Authorised</span>
            <Laptop className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-sm sm:text-base font-bold text-white font-mono">
            {deviceCount} / {firm.maxDevices} max
          </div>
          <div className="text-[11px] text-slate-400">Hardware web instances</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Firm Users</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-sm sm:text-base font-bold text-white font-mono">{userCount} active</div>
          <div className="text-[11px] text-slate-400">Plan: {plan?.name || 'Standard'}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Last Activity</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-sm sm:text-base font-bold text-white font-mono">
            {lastActivity ? new Date(lastActivity).toLocaleDateString() : 'Never'}
          </div>
          <div className="text-[11px] text-slate-400">Chamber session log</div>
        </div>
      </div>

      {/* Lifecycle Actions Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-200">Lifecycle & Access Controls</div>
          <div className="text-xs text-slate-400">
            Enforce immediate access suspension, reactivation, or soft-deletion.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {firm.status === 'active' && (
            <>
              <button
                onClick={() => setConfirmAction('suspend')}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-medium rounded-lg border border-amber-500/30 min-h-[44px] transition-colors"
              >
                <PauseCircle className="w-4 h-4" /> Suspend Firm
              </button>
              <button
                onClick={() => setConfirmAction('disable')}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 min-h-[44px] transition-colors"
              >
                <Ban className="w-4 h-4" /> Disable Firm
              </button>
            </>
          )}

          {(firm.status === 'suspended' || firm.status === 'disabled') && (
            <button
              onClick={() => setConfirmAction('reactivate')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg min-h-[44px] transition-colors"
            >
              <PlayCircle className="w-4 h-4" /> Reactivate Firm
            </button>
          )}

          <button
            onClick={() => setConfirmAction('delete')}
            className="flex items-center gap-1.5 px-3 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 text-xs font-medium rounded-lg border border-rose-500/20 min-h-[44px] transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete Firm
          </button>
        </div>
      </div>

      {/* Tabs: License History, Payments, & Devices */}
      <div className="space-y-4">
        <div className="flex border-b border-slate-800 gap-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('devices')}
            className={`pb-3 text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 whitespace-nowrap min-h-[44px] ${
              activeTab === 'devices'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Laptop className="w-4 h-4" />
            Devices ({devices.length})
            {devices.filter((d) => d.status === 'pending').length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {devices.filter((d) => d.status === 'pending').length} pending
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('license')}
            className={`pb-3 text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 whitespace-nowrap min-h-[44px] ${
              activeTab === 'license'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            License History ({licenseEvents.length})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`pb-3 text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 whitespace-nowrap min-h-[44px] ${
              activeTab === 'payments'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Payments ({payments.length})
          </button>
        </div>

        {/* Tab: Devices (Step D: Web-app level browser install authorization) */}
        {activeTab === 'devices' && (
          <div className="space-y-4">
            {/* Honest Architecture Disclaimer Banner */}
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-200">Device Model:</span> A "device" is a browser install
                identified by a random ID stored in an httpOnly cookie, not physical hardware. If users clear browser
                cookies or use a new profile, a new pending registration will appear here.
              </div>
            </div>

            {/* Quota Summary Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 rounded-xl">
              <div>
                <div className="text-xs text-slate-400">Device Quota Usage</div>
                <div className="text-base font-bold text-white font-mono">
                  {devices.filter((d) => d.status === 'approved').length} / {firm.maxDevices} Approved
                </div>
              </div>
              <div className="text-xs text-slate-400">
                Policy: <span className="text-indigo-400 font-semibold">{firm.devicePolicy ?? 'auto-approve'}</span> • Staff
                removal by owner: <span className="font-semibold">{firm.allowOwnerDeviceRemoval ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>

            {/* Device List */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
              {devices.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">No devices registered for this chamber yet.</div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {devices.map((dev) => (
                    <div
                      key={dev.id}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white text-sm">{dev.name}</span>
                          {dev.status === 'approved' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Approved
                            </span>
                          )}
                          {dev.status === 'pending' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              Pending Approval
                            </span>
                          )}
                          {dev.status === 'revoked' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              Revoked
                            </span>
                          )}
                          {dev.status === 'rejected' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                              Rejected
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          Operated by: <span className="text-slate-200 font-medium">{dev.userName}</span> ({dev.userEmail}) •{' '}
                          <span className="text-indigo-400">{dev.userRole}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          First seen: {new Date(dev.firstSeenAt).toLocaleString()} • Last seen:{' '}
                          {new Date(dev.lastSeenAt).toLocaleString()}
                        </div>
                      </div>

                      {/* Device Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        {dev.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApproveDevice(dev.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg min-h-[44px] transition-colors"
                            >
                              <CheckCircle className="w-4 h-4" /> Approve
                            </button>
                            <button
                              onClick={() => handleRejectDevice(dev.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 min-h-[44px] transition-colors"
                            >
                              <XCircle className="w-4 h-4" /> Reject
                            </button>
                          </>
                        )}
                        {dev.status === 'approved' && (
                          <button
                            onClick={() => setDeviceToRevoke(dev)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 text-xs font-medium rounded-lg border border-rose-500/20 min-h-[44px] transition-colors"
                          >
                            <Ban className="w-4 h-4" /> Revoke Access
                          </button>
                        )}
                        {(dev.status === 'revoked' || dev.status === 'rejected') && (
                          <button
                            onClick={() => handleApproveDevice(dev.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg min-h-[44px] transition-colors"
                          >
                            <CheckCircle className="w-4 h-4" /> Re-Approve
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 1: License Events */}
        {activeTab === 'license' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            {licenseEvents.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">No license history recorded yet.</div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {licenseEvents.map((evt) => (
                  <div key={evt.id} className="p-4 space-y-1.5 hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-indigo-400 font-mono">[{evt.type}]</span>
                      <span className="text-slate-500">{new Date(evt.at).toLocaleString()}</span>
                    </div>
                    {evt.new && (
                      <pre className="text-[11px] font-mono text-slate-300 bg-slate-950/60 p-2.5 rounded-lg overflow-x-auto">
                        {JSON.stringify(evt.new, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Payments */}
        {activeTab === 'payments' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            {payments.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">No payments recorded for this chamber.</div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {payments.map((pmt) => (
                  <div key={pmt.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-white text-sm">
                        {pmt.amount.toLocaleString()} BDT via <span className="text-indigo-400">{pmt.method}</span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono">TrxID: {pmt.txnId}</div>
                      {pmt.note && <div className="text-xs text-slate-300 italic pt-0.5">{pmt.note}</div>}
                    </div>
                    <div className="text-xs text-slate-500 sm:text-right">
                      <div>{new Date(pmt.paidAt).toLocaleDateString()}</div>
                      <div>Verified by: {pmt.verifiedBy || 'Admin'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <RenewModal
        isOpen={isRenewOpen}
        onClose={() => setIsRenewOpen(false)}
        firm={firm}
        onSuccess={() => fetchFirmDetails()}
      />

      <LicenseModal
        isOpen={isLicenseOpen}
        onClose={() => setIsLicenseOpen(false)}
        firm={firm}
        onSuccess={() => fetchFirmDetails()}
      />

      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        firm={firm}
        onSuccess={() => fetchFirmDetails()}
      />

      {/* Confirmation Modals */}
      {confirmAction === 'suspend' && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setConfirmAction(null)}
          onConfirm={handleExecuteConfirm}
          title="Suspend Chamber Firm"
          message={`Are you sure you want to suspend "${firm.name}"? All existing sessions will immediately terminate with HTTP 403, and users will not be permitted to sign in until reactivated.`}
          confirmLabel="Suspend Firm"
          variant="warning"
          loading={actionLoading}
        />
      )}

      {confirmAction === 'disable' && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setConfirmAction(null)}
          onConfirm={handleExecuteConfirm}
          title="Disable Chamber Firm"
          message={`Are you sure you want to disable "${firm.name}"? The firm will be marked inactive and blocked from logging in.`}
          confirmLabel="Disable Firm"
          variant="danger"
          loading={actionLoading}
        />
      )}

      {confirmAction === 'reactivate' && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setConfirmAction(null)}
          onConfirm={handleExecuteConfirm}
          title="Reactivate Chamber Firm"
          message={`Are you sure you want to reactivate "${firm.name}"? Active users will be able to log in normally.`}
          confirmLabel="Reactivate Firm"
          variant="primary"
          loading={actionLoading}
        />
      )}

      {confirmAction === 'delete' && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setConfirmAction(null)}
          onConfirm={handleExecuteConfirm}
          title="Soft-Delete Chamber Firm"
          message={`This will soft-delete the firm "${firm.name}". In accordance with platform security invariants, all underlying case, client, and file records are strictly retained in the database.`}
          confirmLabel="Delete Firm"
          variant="danger"
          requiredConfirmationText={firm.name}
          loading={actionLoading}
        />
      )}

      {/* Device Revoke Confirm Modal */}
      {deviceToRevoke && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setDeviceToRevoke(null)}
          onConfirm={handleRevokeDevice}
          title="Revoke Device Authorization"
          message={`Are you sure you want to revoke authorization for device "${deviceToRevoke.name}" used by ${deviceToRevoke.userName} (${deviceToRevoke.userEmail})? This browser install's active session will be invalidated immediately.`}
          confirmLabel="Revoke Device"
          variant="danger"
          loading={actionLoading}
        />
      )}
    </div>
  );
};
