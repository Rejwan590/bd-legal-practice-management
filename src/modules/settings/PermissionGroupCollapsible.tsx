import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PermissionKey } from '../../permissions';
import { UserRecord } from '../../data/types';

interface PermissionGroup {
  key: string;
  labelKey: string;
  defaultLabel: string;
  permissions: PermissionKey[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'cases',
    labelKey: 'settings.areaCases',
    defaultLabel: 'Cases & Litigation',
    permissions: ['cases.view', 'cases.create', 'cases.edit', 'cases.delete', 'restricted.view'],
  },
  {
    key: 'clients',
    labelKey: 'settings.areaClients',
    defaultLabel: 'Clients & Contacts',
    permissions: ['clients.view', 'clients.edit'],
  },
  {
    key: 'hearings',
    labelKey: 'settings.areaHearings',
    defaultLabel: 'Court Hearings',
    permissions: ['hearings.update'],
  },
  {
    key: 'tasks',
    labelKey: 'settings.areaTasks',
    defaultLabel: 'Tasks & Deadlines',
    permissions: ['tasks.view', 'tasks.assign', 'tasks.complete'],
  },
  {
    key: 'files',
    labelKey: 'settings.areaFiles',
    defaultLabel: 'Physical Files',
    permissions: ['files.view', 'files.manage'],
  },
  {
    key: 'appointments',
    labelKey: 'settings.areaAppointments',
    defaultLabel: 'Appointments & Meetings',
    permissions: ['appointments.view', 'appointments.manage'],
  },
  {
    key: 'accounts',
    labelKey: 'settings.areaAccounts',
    defaultLabel: 'Accounts & Billing',
    permissions: ['billing.view', 'accounts.view', 'accounts.manage', 'expenses.record', 'accounts.export'],
  },
  {
    key: 'chamberExpenses',
    labelKey: 'settings.areaChamberExpenses',
    defaultLabel: 'Chamber Operational Expenses',
    permissions: [
      'chamber_expenses.view',
      'chamber_expenses.record',
      'chamber_expenses.manage',
      'chamber_expenses.salary',
    ],
  },
  {
    key: 'admin',
    labelKey: 'settings.areaAdmin',
    defaultLabel: 'Administration & Security',
    permissions: ['settings.manage', 'users.manage', 'data.export'],
  },
];

interface Props {
  user: UserRecord;
  currentUser: UserRecord;
  canManageUsers: boolean;
  isReadOnly: boolean;
  onTogglePermission: (userId: string, perm: PermissionKey) => void;
}

export const PermissionGroupCollapsible: React.FC<Props> = ({
  user,
  currentUser,
  canManageUsers,
  isReadOnly,
  onTogglePermission,
}) => {
  const { t } = useTranslation();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isOwner = user.role === 'Owner';
  const isSelf = user.id === currentUser.id;

  return (
    <div className="space-y-2.5">
      {PERMISSION_GROUPS.map((group) => {
        const isCollapsed = Boolean(collapsedGroups[group.key]);
        const grantedCount = isOwner
          ? group.permissions.length
          : group.permissions.filter((p) => user.permissions.includes(p)).length;

        return (
          <div
            key={group.key}
            className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50"
          >
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-800 hover:bg-slate-100/70 transition min-h-[44px] cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span>{t(group.labelKey, group.defaultLabel)}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    grantedCount === group.permissions.length
                      ? 'bg-emerald-100 text-emerald-800'
                      : grantedCount > 0
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {grantedCount} / {group.permissions.length}
                </span>
              </div>
              <div className="text-slate-400">
                {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </div>
            </button>

            {!isCollapsed && (
              <div className="p-3 border-t border-slate-200 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {group.permissions.map((perm) => {
                  const hasPerm = isOwner || user.permissions.includes(perm);
                  const permKey = perm.replace('.', '_');
                  const label = t(`permissions.${permKey}`, perm);

                  return (
                    <label
                      key={perm}
                      className={`flex items-start gap-2.5 min-h-[44px] p-2.5 rounded-xl text-xs transition border ${
                        hasPerm
                          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                          : 'bg-white border-slate-200 text-slate-500 opacity-60'
                      } ${
                        !isOwner && !isSelf && canManageUsers && !isReadOnly
                          ? 'cursor-pointer hover:bg-slate-100'
                          : 'cursor-default'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={isOwner || isSelf || !canManageUsers || isReadOnly}
                        checked={hasPerm}
                        onChange={() => onTogglePermission(user.id, perm)}
                        className="mt-0.5 rounded text-slate-900 focus:ring-slate-500 w-4 h-4 shrink-0 disabled:opacity-50 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium block leading-tight break-words">
                          {label}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                          {perm}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
