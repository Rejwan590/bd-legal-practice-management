import {
  PlatformAdmin,
  Firm,
  FirmDetailResponse,
  CreateFirmPayload,
  CreateFirmResponse,
  LicenseEvent,
  Payment,
  AdminAuditEntry,
  Device,
  FirmDevicesResponse,
} from '../types/adminTypes';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Security: strictly use httpOnly admin_access_token cookie
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }

  if (!res.ok) {
    const errorMsg = data?.message || data?.error || `Request failed with status ${res.status}`;
    const err = new Error(errorMsg);
    (err as any).status = res.status;
    (err as any).data = data;
    throw err;
  }

  return data as T;
}

export const adminApi = {
  // Auth
  async login(email: string, password: string): Promise<{ success: boolean; admin: PlatformAdmin }> {
    return adminFetch<{ success: boolean; admin: PlatformAdmin }>('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async logout(): Promise<void> {
    await adminFetch('/api/admin/auth/logout', { method: 'POST' });
  },

  async getMe(): Promise<{ admin: PlatformAdmin }> {
    return adminFetch<{ admin: PlatformAdmin }>('/api/admin/auth/me');
  },

  // Firms
  async listFirms(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  } = {}): Promise<{ firms: Firm[]; total: number; page: number; limit: number; totalPages: number }> {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    if (params.search) q.set('search', params.search);
    if (params.status && params.status !== 'all') q.set('status', params.status);

    const queryStr = q.toString() ? `?${q.toString()}` : '';
    return adminFetch<{ firms: Firm[]; total: number; page: number; limit: number; totalPages: number }>(
      `/api/admin/firms${queryStr}`
    );
  },

  async getFirm(id: string): Promise<FirmDetailResponse> {
    return adminFetch<FirmDetailResponse>(`/api/admin/firms/${id}`);
  },

  async createFirm(payload: CreateFirmPayload): Promise<CreateFirmResponse> {
    return adminFetch<CreateFirmResponse>('/api/admin/firms', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateFirm(id: string, updates: Partial<Firm>): Promise<{ message: string; firm: Firm }> {
    return adminFetch<{ message: string; firm: Firm }>(`/api/admin/firms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async suspendFirm(id: string): Promise<{ message: string; firm: Firm }> {
    return adminFetch<{ message: string; firm: Firm }>(`/api/admin/firms/${id}/suspend`, {
      method: 'POST',
    });
  },

  async disableFirm(id: string): Promise<{ message: string; firm: Firm }> {
    return adminFetch<{ message: string; firm: Firm }>(`/api/admin/firms/${id}/disable`, {
      method: 'POST',
    });
  },

  async reactivateFirm(id: string): Promise<{ message: string; firm: Firm }> {
    return adminFetch<{ message: string; firm: Firm }>(`/api/admin/firms/${id}/reactivate`, {
      method: 'POST',
    });
  },

  async deleteFirm(id: string, confirmFirmName: string): Promise<{ message: string; firm: Firm }> {
    return adminFetch<{ message: string; firm: Firm }>(`/api/admin/firms/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirmFirmName }),
    });
  },

  async listFirmUsers(firmId: string): Promise<{ users: any[] }> {
    return adminFetch<{ users: any[] }>(`/api/admin/firms/${firmId}/users`);
  },

  async resetUserPassword(
    firmId: string,
    userId: string
  ): Promise<{ message: string; temporaryPassword: string; user: any }> {
    return adminFetch<{ message: string; temporaryPassword: string; user: any }>(
      `/api/admin/firms/${firmId}/users/${userId}/reset-password`,
      {
        method: 'POST',
      }
    );
  },

  // License & Payments
  async updateLicense(
    id: string,
    payload: { planId?: string; maxDevices?: number; startDate?: string; expiryDate?: string }
  ): Promise<{ message: string; firm: Firm }> {
    return adminFetch<{ message: string; firm: Firm }>(`/api/admin/firms/${id}/license`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async renewLicense(id: string, months = 12): Promise<{ message: string; firm: Firm; licenseExpiresAt: string }> {
    return adminFetch<{ message: string; firm: Firm; licenseExpiresAt: string }>(`/api/admin/firms/${id}/renew`, {
      method: 'POST',
      body: JSON.stringify({ months }),
    });
  },

  async recordPayment(
    id: string,
    payload: { amount: number; method: 'bKash' | 'Nagad' | 'bank'; txnId: string; note?: string }
  ): Promise<{ message: string; payment: Payment }> {
    return adminFetch<{ message: string; payment: Payment }>(`/api/admin/firms/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async listLicenseEvents(firmId: string): Promise<LicenseEvent[]> {
    return adminFetch<LicenseEvent[]>(`/api/admin/firms/${firmId}/license-events`);
  },

  async listPayments(firmId: string): Promise<Payment[]> {
    return adminFetch<Payment[]>(`/api/admin/firms/${firmId}/payments`);
  },

  async listAdminAudits(limit = 50, offset = 0): Promise<{ logs: AdminAuditEntry[]; limit: number; offset: number }> {
    return adminFetch<{ logs: AdminAuditEntry[]; limit: number; offset: number }>(
      `/api/admin/audit?limit=${limit}&offset=${offset}`
    );
  },

  // Device Management (Step D: Web-app level browser install authorization)
  async getFirmDevices(firmId: string): Promise<FirmDevicesResponse> {
    return adminFetch<FirmDevicesResponse>(`/api/admin/firms/${firmId}/devices`);
  },

  async approveDevice(deviceId: string): Promise<{ message: string; device: Device }> {
    return adminFetch<{ message: string; device: Device }>(`/api/admin/devices/${deviceId}/approve`, {
      method: 'POST',
    });
  },

  async rejectDevice(deviceId: string): Promise<{ message: string; device: Device }> {
    return adminFetch<{ message: string; device: Device }>(`/api/admin/devices/${deviceId}/reject`, {
      method: 'POST',
    });
  },

  async revokeDevice(deviceId: string): Promise<{ message: string; device: Device }> {
    return adminFetch<{ message: string; device: Device }>(`/api/admin/devices/${deviceId}/revoke`, {
      method: 'POST',
    });
  },
};

