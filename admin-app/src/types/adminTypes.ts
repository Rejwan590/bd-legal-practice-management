export interface PlatformAdmin {
  id: string;
  email: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type FirmStatus = 'active' | 'expired' | 'suspended' | 'disabled';

export interface Firm {
  id: string;
  firmId: string;
  name: string;
  contact: string | null;
  officeAddress: string | null;
  barCouncilReg: string | null;
  courtAffiliations: string | null;
  planId: string | null;
  maxDevices: number;
  devicePolicy?: 'auto-approve' | 'manual';
  allowOwnerDeviceRemoval?: boolean;
  pendingDeviceCount?: number;
  approvedDeviceCount?: number;
  licenseStartsAt: string | null;
  licenseExpiresAt: string;
  status: FirmStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Plan {
  id: string;
  name: string;
  durationMonths: number;
  priceBdt: number;
  seats: number;
  features: string[];
}

export interface LicenseInfo {
  planId: string | null;
  maxDevices: number;
  licenseStartsAt: string | null;
  licenseExpiresAt: string;
  status: FirmStatus;
  isExpired: boolean;
}

export interface Device {
  id: string;
  firmId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  name: string;
  userAgent: string;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  firstSeenAt: string;
  lastSeenAt: string;
  approvedByAdminId: string | null;
}

export interface FirmDevicesResponse {
  devices: Device[];
  maxDevices: number;
  devicePolicy: 'auto-approve' | 'manual';
  allowOwnerDeviceRemoval: boolean;
}

export interface FirmDetailResponse {
  firm: Firm;
  plan: Plan | null;
  license: LicenseInfo;
  userCount: number;
  deviceCount: number;
  pendingDeviceCount?: number;
  lastActivity: string | null;
}

export interface LicenseEvent {
  id: string;
  firmId: string;
  type: string;
  old: Record<string, unknown> | null;
  new: Record<string, unknown> | null;
  byAdmin: string;
  at: string;
}

export interface Payment {
  id: string;
  firmId: string;
  amount: number;
  method: 'bKash' | 'Nagad' | 'bank' | string;
  txnId: string;
  note: string | null;
  paidAt: string;
  verifiedBy: string | null;
}

export interface AdminAuditEntry {
  id: string;
  adminId: string;
  action: string;
  targetFirmId: string | null;
  old: Record<string, unknown> | null;
  new: Record<string, unknown> | null;
  ip: string | null;
  at: string;
}

export interface CreateFirmPayload {
  name: string;
  ownerName: string;
  ownerEmail: string;
  contact?: string;
  officeAddress?: string;
  barCouncilReg?: string;
  courtAffiliations?: string;
  planId?: string;
  months?: number;
  maxDevices?: number;
}

export interface CreateFirmResponse {
  message: string;
  firm: Firm;
  ownerUser: {
    id: string;
    name: string;
    email: string;
    role: string;
    mustChangePassword: boolean;
  };
  temporaryPassword: string;
}
