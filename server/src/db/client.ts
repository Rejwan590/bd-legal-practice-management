import pg from 'pg';
import crypto from 'crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, desc, or, ilike, ne, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from './schema.js';
import { getSeedUsers, SEED_FIRMS, SEED_PLANS, SEED_CLIENTS, SEED_CASES } from './seed.js';
import { canUserSeeCase, buildCaseVisibilitySql } from '../services/visibilityService.js';

export interface VisibilityUserContext {
  id: string;
  firmId: string;
  role: string;
  permissions?: string[];
}

export interface ClientLinkedOverview {
  cases: Array<{
    id: string;
    caseNumber: string;
    court: string;
    matterType: string;
    status: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    dueAt: string;
  }>;
  files: Array<{
    id: string;
    serial: string;
    status: string;
    holderName: string;
  }>;
}

export interface CaseLinkedCounts {
  hearingsCount: number;
  tasksCount: number;
  filesCount: number;
  remindersCount: number;
}

export interface IDatabase {
  isHealthy(): Promise<boolean>;
  getFirm(id: string, includeDeleted?: boolean): Promise<schema.Firm | null>;
  updateFirm(id: string, updates: Partial<schema.Firm>): Promise<schema.Firm>;
  insertFirm(firm: schema.Firm | schema.NewFirm): Promise<schema.Firm>;
  listFirms(query?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    includeDeleted?: boolean;
  }): Promise<{ firms: schema.Firm[]; total: number; page: number; limit: number }>;
  getPlan(id: string): Promise<schema.Plan | null>;
  listPlans(): Promise<schema.Plan[]>;
  getUserByEmail(email: string): Promise<schema.User | null>;
  getUserById(id: string): Promise<schema.User | null>;
  listUsers(firmId: string): Promise<schema.User[]>;
  insertUser(user: schema.User | schema.NewUser): Promise<schema.User>;
  updateUser(id: string, updates: Partial<schema.User>): Promise<schema.User>;
  incrementFailedLogin(
    id: string,
    lockedUntil: Date | null
  ): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null }>;
  resetFailedLogin(id: string): Promise<void>;
  insertAudit(entry: schema.AuditLogEntry): Promise<schema.AuditLogEntry>;
  listAudit(
    firmId: string,
    limit?: number,
    offset?: number,
    includeRestricted?: boolean,
    user?: VisibilityUserContext
  ): Promise<schema.AuditLogEntry[]>;
  // Clients (Step 3.1)
  listClients(firmId: string, search?: string): Promise<schema.Client[]>;
  getClientById(id: string, firmId: string): Promise<schema.Client | null>;
  insertClient(client: schema.Client): Promise<schema.Client>;
  updateClient(id: string, firmId: string, updates: Partial<schema.Client>): Promise<schema.Client>;
  countActiveCasesForClient(clientId: string, firmId: string): Promise<number>;
  getClientLinkedOverview(
    clientId: string,
    firmId: string,
    includeRestricted?: boolean,
    user?: VisibilityUserContext
  ): Promise<ClientLinkedOverview>;
  // Cases (Step 3.2)
  listCases(
    firmId: string,
    filter?: {
      search?: string;
      status?: 'ongoing' | 'closed' | 'all';
      court?: string;
      matterType?: string;
      clientId?: string;
      includeRestricted?: boolean;
      user?: VisibilityUserContext;
      scope?: 'my' | 'team' | 'all';
    }
  ): Promise<schema.Case[]>;
  getCaseById(id: string, firmId: string, user?: VisibilityUserContext): Promise<schema.Case | null>;
  insertCase(c: schema.Case): Promise<schema.Case>;
  updateCase(id: string, firmId: string, updates: Partial<schema.Case>): Promise<schema.Case>;
  checkDuplicateCase(
    firmId: string,
    caseNumber: string,
    court: string,
    excludeId?: string,
    includeRestricted?: boolean,
    user?: VisibilityUserContext
  ): Promise<boolean>;
  getCaseLinkedCounts(caseId: string, firmId: string): Promise<CaseLinkedCounts>;
  // Case Shares
  listCaseShares(caseId: string, firmId: string): Promise<schema.CaseShare[]>;
  listFirmCaseShares(firmId: string): Promise<schema.CaseShare[]>;
  insertCaseShare(share: schema.NewCaseShare): Promise<schema.CaseShare>;
  deleteCaseShare(id: string, firmId: string): Promise<void>;
  // Hearings
  listHearings(firmId: string, user?: VisibilityUserContext): Promise<schema.Hearing[]>;
  insertHearing(hearing: schema.NewHearing): Promise<schema.Hearing>;
  updateHearing(id: string, firmId: string, updates: Partial<schema.Hearing>): Promise<schema.Hearing>;
  // Platform Admins & Admin Audit (Super Admin for software owner)
  getPlatformAdminByEmail(email: string): Promise<schema.PlatformAdmin | null>;
  getPlatformAdminById(id: string): Promise<schema.PlatformAdmin | null>;
  listPlatformAdmins(): Promise<schema.PlatformAdmin[]>;
  insertPlatformAdmin(admin: schema.NewPlatformAdmin): Promise<schema.PlatformAdmin>;
  updatePlatformAdmin(id: string, updates: Partial<schema.PlatformAdmin>): Promise<schema.PlatformAdmin>;
  incrementPlatformAdminFailedLogin(
    id: string,
    lockedUntil: Date | null
  ): Promise<{ failedAttempts: number; lockedUntil: Date | null }>;
  resetPlatformAdminFailedLogin(id: string): Promise<void>;
  insertAdminAudit(entry: schema.NewAdminAuditEntry): Promise<schema.AdminAuditEntry>;
  listAdminAudit(limit?: number, offset?: number): Promise<schema.AdminAuditEntry[]>;
  // License Events (Step B)
  insertLicenseEvent(event: schema.NewLicenseEvent): Promise<schema.LicenseEvent>;
  listLicenseEvents(firmId?: string, limit?: number): Promise<schema.LicenseEvent[]>;
  // Payments (Step B)
  insertPayment(payment: schema.NewPayment): Promise<schema.Payment>;
  listPayments(firmId: string): Promise<schema.Payment[]>;
  // Devices (Step D: Browser install authorization identified by cryptographically random key, not physical hardware)
  getDeviceById(id: string): Promise<schema.Device | null>;
  getDeviceByHash(deviceKeyHash: string): Promise<schema.Device | null>;
  listDevices(firmId: string): Promise<schema.Device[]>;
  countApprovedDevices(firmId: string): Promise<number>;
  countPendingDevices(firmId: string): Promise<number>;
  insertDevice(device: schema.NewDevice): Promise<schema.Device>;
  updateDevice(id: string, updates: Partial<schema.Device>): Promise<schema.Device>;
  deleteDevice(id: string): Promise<void>;
  // Metrics (Step B & D)
  getFirmMetrics(firmId: string): Promise<{ userCount: number; deviceCount: number; pendingDeviceCount: number; lastActivity: Date | null }>;
  // Transactions (R-10: Multi-step write atomicity)
  transaction<T>(callback: (txDb: IDatabase) => Promise<T>): Promise<T>;
}

// In-Memory Database Adapter (for headless testing and local development without active Docker container)
class MemoryDatabase implements IDatabase {
  public plans: schema.Plan[] = [];
  public firms: schema.Firm[] = [];
  public users: schema.User[] = [];
  public clients: schema.Client[] = [];
  public cases: schema.Case[] = [];
  public hearings: schema.Hearing[] = [];
  public caseShares: schema.CaseShare[] = [];
  public auditLogs: schema.AuditLogEntry[] = [];
  public platformAdmins: schema.PlatformAdmin[] = [];
  public adminAudits: schema.AdminAuditEntry[] = [];
  public licenseEvents: schema.LicenseEvent[] = [];
  public payments: schema.Payment[] = [];
  public devices: schema.Device[] = [];
  private initialized = false;

  public async init() {
    if (this.initialized) return;
    this.plans = [...SEED_PLANS];
    this.firms = [...SEED_FIRMS];
    this.users = await getSeedUsers();
    this.clients = [...SEED_CLIENTS];
    this.cases = [...SEED_CASES];
    if (this.platformAdmins.length === 0) {
      const adminHash = await bcrypt.hash('PlatformAdmin2026!', 10);
      this.platformAdmins = [
        {
          id: 'admin-platform-001',
          email: 'admin@platform.bd',
          passwordHash: adminHash,
          active: true,
          failedAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        },
      ];
    }
    this.initialized = true;
  }

  public async isHealthy(): Promise<boolean> {
    return true;
  }

  public async getFirm(id: string, includeDeleted = false): Promise<schema.Firm | null> {
    await this.init();
    const firm = this.firms.find((f) => f.id === id && (includeDeleted || !f.deletedAt));
    return firm ? { ...firm } : null;
  }

  public async updateFirm(id: string, updates: Partial<schema.Firm>): Promise<schema.Firm> {
    await this.init();
    const index = this.firms.findIndex((f) => f.id === id);
    if (index === -1) throw new Error(`Firm not found: ${id}`);
    const updated = {
      ...this.firms[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.firms[index] = updated;
    return { ...updated };
  }

  public async insertFirm(firm: schema.Firm | schema.NewFirm): Promise<schema.Firm> {
    await this.init();
    const newFirm: schema.Firm = {
      id: firm.id || `firm-${crypto.randomUUID()}`,
      firmId: firm.firmId || firm.id || `firm-${crypto.randomUUID()}`,
      name: firm.name,
      barCouncilReg: firm.barCouncilReg ?? null,
      officeAddress: firm.officeAddress ?? null,
      courtAffiliations: firm.courtAffiliations ?? null,
      contact: firm.contact ?? null,
      maxDevices: firm.maxDevices ?? 5,
      devicePolicy: firm.devicePolicy ?? 'auto-approve',
      allowOwnerDeviceRemoval: firm.allowOwnerDeviceRemoval ?? false,
      visibilityMode: firm.visibilityMode ?? 'team',
      planId: firm.planId ?? null,
      licenseStartsAt: firm.licenseStartsAt ?? new Date(),
      licenseExpiresAt: firm.licenseExpiresAt,
      status: firm.status ?? 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: firm.createdBy ?? null,
      updatedBy: firm.updatedBy ?? null,
    };
    this.firms.push(newFirm);
    return { ...newFirm };
  }

  public async listFirms(query?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    includeDeleted?: boolean;
  }): Promise<{ firms: schema.Firm[]; total: number; page: number; limit: number }> {
    await this.init();
    const page = Math.max(1, query?.page || 1);
    const limit = Math.max(1, Math.min(100, query?.limit || 20));

    let list = this.firms.filter((f) => (query?.includeDeleted ? true : !f.deletedAt));

    if (query?.status && query.status !== 'all') {
      list = list.filter((f) => f.status === query.status);
    }

    if (query?.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.firmId.toLowerCase().includes(q) ||
          (f.contact && f.contact.toLowerCase().includes(q)) ||
          (f.officeAddress && f.officeAddress.toLowerCase().includes(q)) ||
          (f.barCouncilReg && f.barCouncilReg.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const paginated = list.slice((page - 1) * limit, page * limit).map((f) => ({ ...f }));

    return { firms: paginated, total, page, limit };
  }

  public async getPlan(id: string): Promise<schema.Plan | null> {
    await this.init();
    const plan = this.plans.find((p) => p.id === id && !p.deletedAt);
    return plan ? { ...plan } : null;
  }

  public async listPlans(): Promise<schema.Plan[]> {
    await this.init();
    return this.plans.filter((p) => !p.deletedAt).map((p) => ({ ...p }));
  }

  public async getUserByEmail(email: string): Promise<schema.User | null> {
    await this.init();
    const user = this.users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && !u.deletedAt
    );
    return user ? { ...user } : null;
  }

  public async getUserById(id: string): Promise<schema.User | null> {
    await this.init();
    const user = this.users.find((u) => u.id === id && !u.deletedAt);
    return user ? { ...user } : null;
  }

  public async listUsers(firmId: string): Promise<schema.User[]> {
    await this.init();
    return this.users
      .filter((u) => u.firmId === firmId && !u.deletedAt)
      .map((u) => ({ ...u }));
  }

  public async insertUser(user: schema.User | schema.NewUser): Promise<schema.User> {
    await this.init();
    const newUser: schema.User = {
      id: user.id || `user-${crypto.randomUUID()}`,
      firmId: user.firmId,
      name: user.name,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      jobType: user.jobType ?? (user.role === 'Owner' ? 'lawyer_senior' : 'other'),
      jobTitleLabel: user.jobTitleLabel ?? null,
      reportsToUserId: user.reportsToUserId ?? null,
      permissions: user.permissions,
      language: user.language ?? 'en',
      active: user.active ?? true,
      mustChangePassword: user.mustChangePassword ?? false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: user.createdBy ?? null,
      updatedBy: user.updatedBy ?? null,
    };
    this.users.push(newUser);
    return { ...newUser };
  }

  public async updateUser(id: string, updates: Partial<schema.User>): Promise<schema.User> {
    await this.init();
    const index = this.users.findIndex((u) => u.id === id);
    if (index === -1) throw new Error(`User not found: ${id}`);
    const updated = {
      ...this.users[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.users[index] = updated;
    return { ...updated };
  }

  public async incrementFailedLogin(
    id: string,
    lockedUntil: Date | null
  ): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null }> {
    await this.init();
    const index = this.users.findIndex((u) => u.id === id);
    if (index === -1) throw new Error(`User not found: ${id}`);
    const u = this.users[index];
    const nextAttempts = (u.failedLoginAttempts || 0) + 1;
    u.failedLoginAttempts = nextAttempts;
    u.lockedUntil = lockedUntil;
    u.updatedAt = new Date();
    return { failedLoginAttempts: nextAttempts, lockedUntil };
  }

  public async resetFailedLogin(id: string): Promise<void> {
    await this.init();
    const index = this.users.findIndex((u) => u.id === id);
    if (index !== -1) {
      this.users[index].failedLoginAttempts = 0;
      this.users[index].lockedUntil = null;
      this.users[index].updatedAt = new Date();
    }
  }

  public async insertAudit(entry: schema.AuditLogEntry): Promise<schema.AuditLogEntry> {
    await this.init();
    this.auditLogs.unshift({ ...entry });
    return { ...entry };
  }

  private getVisibleCaseSetForMemory(
    firmId: string,
    user?: VisibilityUserContext,
    includeRestricted = true,
    includeDeleted = false
  ): Set<string> {
    const firm = this.firms.find((f) => f.id === firmId) || { id: firmId, visibilityMode: 'open' };
    const firmUsers = this.users.filter((u) => u.firmId === firmId && !u.deletedAt);
    const firmShares = this.caseShares.filter((s) => s.firmId === firmId && !s.deletedAt);
    return new Set(
      this.cases
        .filter((c) => {
          if (c.firmId !== firmId) return false;
          if (!includeDeleted && c.deletedAt) return false;
          if (!includeRestricted && c.restricted) return false;
          if (user) {
            return canUserSeeCase(user, c, firm, firmUsers, firmShares, includeDeleted);
          }
          return true;
        })
        .map((c) => c.id)
    );
  }

  public async listAudit(
    firmId: string,
    limit = 100,
    offset = 0,
    includeRestricted = true,
    user?: VisibilityUserContext
  ): Promise<schema.AuditLogEntry[]> {
    await this.init();
    let entries = this.auditLogs.filter((a) => a.firmId === firmId);
    const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, includeRestricted, true);
    const allFirmCaseIds = new Set(this.cases.filter((c) => c.firmId === firmId).map((c) => c.id));

    entries = entries.filter((a) => {
      if (a.entity === 'Case') {
        if (allFirmCaseIds.has(a.entityId) && !visibleCaseIds.has(a.entityId)) return false;
      }
      if (!includeRestricted) {
        if (a.oldValue && (a.oldValue as any).restricted === true) return false;
        if (a.newValue && (a.newValue as any).restricted === true) return false;
      }
      const oldCaseId = a.oldValue ? (a.oldValue as any).caseId : undefined;
      if (oldCaseId && allFirmCaseIds.has(String(oldCaseId)) && !visibleCaseIds.has(String(oldCaseId))) {
        return false;
      }
      const newCaseId = a.newValue ? (a.newValue as any).caseId : undefined;
      if (newCaseId && allFirmCaseIds.has(String(newCaseId)) && !visibleCaseIds.has(String(newCaseId))) {
        return false;
      }
      return true;
    });
    return entries.slice(offset, offset + limit).map((a) => ({ ...a }));
  }

  // Clients Methods
  public async listClients(firmId: string, search?: string): Promise<schema.Client[]> {
    await this.init();
    let res = this.clients.filter((c) => c.firmId === firmId && !c.deletedAt);
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      res = res.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.nameBn && c.nameBn.toLowerCase().includes(q)) ||
          c.phone.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q)
      );
    }
    return res.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async getClientById(id: string, firmId: string): Promise<schema.Client | null> {
    await this.init();
    const c = this.clients.find((x) => x.id === id && x.firmId === firmId && !x.deletedAt);
    return c ? { ...c } : null;
  }

  public async insertClient(client: schema.Client): Promise<schema.Client> {
    await this.init();
    this.clients.unshift({ ...client });
    return { ...client };
  }

  public async updateClient(id: string, firmId: string, updates: Partial<schema.Client>): Promise<schema.Client> {
    await this.init();
    const index = this.clients.findIndex((c) => c.id === id && c.firmId === firmId);
    if (index === -1) throw new Error(`Client not found: ${id}`);
    const updated = {
      ...this.clients[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.clients[index] = updated;
    return { ...updated };
  }

  public async countActiveCasesForClient(clientId: string, firmId: string): Promise<number> {
    await this.init();
    return this.cases.filter(
      (c) => c.clientId === clientId && c.firmId === firmId && !c.deletedAt && c.status === 'ongoing'
    ).length;
  }

  public async getClientLinkedOverview(
    clientId: string,
    firmId: string,
    includeRestricted = true,
    user?: VisibilityUserContext
  ): Promise<ClientLinkedOverview> {
    await this.init();
    const visibleIds = this.getVisibleCaseSetForMemory(firmId, user, includeRestricted);
    const clientCases = this.cases.filter(
      (c) => c.clientId === clientId && visibleIds.has(c.id)
    );

    return {
      cases: clientCases.map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber,
        court: c.court,
        matterType: c.matterType,
        status: c.status === 'ongoing' ? 'Ongoing' : 'Closed',
      })),
      tasks: [],
      files: [],
    };
  }

  // Cases Methods
  public async listCases(
    firmId: string,
    filter?: {
      search?: string;
      status?: 'ongoing' | 'closed' | 'all';
      court?: string;
      matterType?: string;
      clientId?: string;
      includeRestricted?: boolean;
      user?: VisibilityUserContext;
      scope?: 'my' | 'team' | 'all';
    }
  ): Promise<schema.Case[]> {
    await this.init();
    const visibleIds = this.getVisibleCaseSetForMemory(
      firmId,
      filter?.user,
      filter?.includeRestricted ?? true
    );
    let res = this.cases.filter((c) => visibleIds.has(c.id));

    if (filter?.user && filter?.scope) {
      const uid = filter.user.id;
      if (filter.scope === 'my') {
        res = res.filter((c) => c.responsibleLawyerId === uid || c.createdBy === uid);
      } else if (filter.scope === 'team') {
        const firmUsers = this.users.filter((u) => u.firmId === firmId && !u.deletedAt);
        const me = firmUsers.find((u) => u.id === uid);
        const teamIds = new Set<string>([uid]);
        if (me?.reportsToUserId) teamIds.add(me.reportsToUserId);
        for (const u of firmUsers) {
          if (u.reportsToUserId === uid) teamIds.add(u.id);
        }
        res = res.filter((c) => c.responsibleLawyerId && teamIds.has(c.responsibleLawyerId));
      }
    }

    if (filter?.clientId) {
      res = res.filter((c) => c.clientId === filter.clientId);
    }

    if (filter?.status && filter.status !== 'all') {
      res = res.filter((c) => c.status === filter.status);
    }

    if (filter?.court && filter.court !== 'ALL') {
      res = res.filter((c) => c.court.toLowerCase().includes(filter.court!.toLowerCase()));
    }

    if (filter?.matterType && filter.matterType !== 'ALL') {
      res = res.filter((c) => c.matterType.toLowerCase().includes(filter.matterType!.toLowerCase()));
    }

    if (filter?.search && filter.search.trim()) {
      const q = filter.search.trim().toLowerCase();
      res = res.filter(
        (c) =>
          c.caseNumber.toLowerCase().includes(q) ||
          (c.plaintiff && c.plaintiff.toLowerCase().includes(q)) ||
          (c.defendant && c.defendant.toLowerCase().includes(q)) ||
          (c.court && c.court.toLowerCase().includes(q)) ||
          (c.matterType && c.matterType.toLowerCase().includes(q)) ||
          (c.fileSerial && c.fileSerial.toLowerCase().includes(q)) ||
          (c.plaintiffLawyer && c.plaintiffLawyer.toLowerCase().includes(q)) ||
          (c.defendantLawyer && c.defendantLawyer.toLowerCase().includes(q))
      );
    }

    return res.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async getCaseById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<schema.Case | null> {
    await this.init();
    const c = this.cases.find((x) => x.id === id && x.firmId === firmId && !x.deletedAt);
    if (!c) return null;
    if (user) {
      const firm = this.firms.find((f) => f.id === firmId) || { id: firmId, visibilityMode: 'open' };
      const firmUsers = this.users.filter((u) => u.firmId === firmId && !u.deletedAt);
      const firmShares = this.caseShares.filter((s) => s.firmId === firmId && !s.deletedAt);
      if (!canUserSeeCase(user, c, firm, firmUsers, firmShares)) {
        return null;
      }
    }
    return { ...c };
  }

  public async insertCase(c: schema.Case): Promise<schema.Case> {
    await this.init();
    this.cases.unshift({ ...c });
    return { ...c };
  }

  public async updateCase(id: string, firmId: string, updates: Partial<schema.Case>): Promise<schema.Case> {
    await this.init();
    const index = this.cases.findIndex((c) => c.id === id && c.firmId === firmId);
    if (index === -1) throw new Error(`Case not found: ${id}`);
    const updated = {
      ...this.cases[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.cases[index] = updated;
    return { ...updated };
  }

  public async checkDuplicateCase(
    firmId: string,
    caseNumber: string,
    court: string,
    excludeId?: string,
    includeRestricted = true,
    user?: VisibilityUserContext
  ): Promise<boolean> {
    await this.init();
    const cleanNum = caseNumber.trim().toLowerCase();
    const cleanCourt = court.trim().toLowerCase();
    const visibleIds = this.getVisibleCaseSetForMemory(firmId, user, includeRestricted);

    return this.cases.some(
      (c) =>
        visibleIds.has(c.id) &&
        c.id !== excludeId &&
        c.caseNumber.trim().toLowerCase() === cleanNum &&
        c.court.trim().toLowerCase() === cleanCourt
    );
  }

  public async getCaseLinkedCounts(caseId: string, firmId: string): Promise<CaseLinkedCounts> {
    await this.init();
    const hearingsCount = this.hearings.filter(
      (h) => h.caseId === caseId && h.firmId === firmId && !h.deletedAt
    ).length;
    return {
      hearingsCount,
      tasksCount: 0,
      filesCount: 0,
      remindersCount: 0,
    };
  }

  public async listCaseShares(caseId: string, firmId: string): Promise<schema.CaseShare[]> {
    await this.init();
    return this.caseShares
      .filter((s) => s.caseId === caseId && s.firmId === firmId && !s.deletedAt)
      .map((s) => ({ ...s }));
  }

  public async listFirmCaseShares(firmId: string): Promise<schema.CaseShare[]> {
    await this.init();
    return this.caseShares
      .filter((s) => s.firmId === firmId && !s.deletedAt)
      .map((s) => ({ ...s }));
  }

  public async insertCaseShare(share: schema.NewCaseShare): Promise<schema.CaseShare> {
    await this.init();
    const existingIdx = this.caseShares.findIndex(
      (s) => s.caseId === share.caseId && s.userId === share.userId && s.firmId === share.firmId && !s.deletedAt
    );
    if (existingIdx !== -1) {
      return { ...this.caseShares[existingIdx] };
    }
    const created: schema.CaseShare = {
      id: share.id || `share-${crypto.randomUUID()}`,
      firmId: share.firmId,
      caseId: share.caseId,
      userId: share.userId,
      createdBy: share.createdBy,
      createdAt: share.createdAt || new Date(),
      deletedAt: null,
    };
    this.caseShares.push(created);
    return { ...created };
  }

  public async deleteCaseShare(id: string, firmId: string): Promise<void> {
    await this.init();
    const idx = this.caseShares.findIndex((s) => s.id === id && s.firmId === firmId && !s.deletedAt);
    if (idx !== -1) {
      this.caseShares[idx].deletedAt = new Date();
    }
  }

  public async listHearings(firmId: string, user?: VisibilityUserContext): Promise<schema.Hearing[]> {
    await this.init();
    const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);
    return this.hearings
      .filter((h) => h.firmId === firmId && !h.deletedAt && visibleCaseIds.has(h.caseId))
      .map((h) => ({ ...h }));
  }

  public async insertHearing(hearing: schema.NewHearing): Promise<schema.Hearing> {
    await this.init();
    const created: schema.Hearing = {
      id: hearing.id || `hearing-${crypto.randomUUID()}`,
      firmId: hearing.firmId,
      caseId: hearing.caseId,
      appearingLawyerId: hearing.appearingLawyerId ?? null,
      scheduledAt: hearing.scheduledAt,
      court: hearing.court ?? null,
      purpose: hearing.purpose ?? null,
      status: hearing.status ?? 'scheduled',
      outcomeNote: hearing.outcomeNote ?? null,
      createdAt: hearing.createdAt || new Date(),
      updatedAt: hearing.updatedAt || new Date(),
      deletedAt: null,
      createdBy: hearing.createdBy ?? null,
      updatedBy: hearing.updatedBy ?? null,
    };
    this.hearings.push(created);
    return { ...created };
  }

  public async updateHearing(id: string, firmId: string, updates: Partial<schema.Hearing>): Promise<schema.Hearing> {
    await this.init();
    const idx = this.hearings.findIndex((h) => h.id === id && h.firmId === firmId && !h.deletedAt);
    if (idx === -1) throw new Error(`Hearing not found: ${id}`);
    const updated = {
      ...this.hearings[idx],
      ...updates,
      updatedAt: new Date(),
    };
    this.hearings[idx] = updated;
    return { ...updated };
  }

  public async getPlatformAdminByEmail(email: string): Promise<schema.PlatformAdmin | null> {
    await this.init();
    const admin = this.platformAdmins.find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase()
    );
    return admin ? { ...admin } : null;
  }

  public async getPlatformAdminById(id: string): Promise<schema.PlatformAdmin | null> {
    await this.init();
    const admin = this.platformAdmins.find((a) => a.id === id);
    return admin ? { ...admin } : null;
  }

  public async listPlatformAdmins(): Promise<schema.PlatformAdmin[]> {
    await this.init();
    return this.platformAdmins.map((a) => ({ ...a }));
  }

  public async insertPlatformAdmin(admin: schema.NewPlatformAdmin): Promise<schema.PlatformAdmin> {
    await this.init();
    const existing = this.platformAdmins.find(
      (a) => a.email.toLowerCase() === admin.email.trim().toLowerCase()
    );
    if (existing) {
      throw new Error(`PlatformAdmin with email ${admin.email} already exists`);
    }
    const fullAdmin: schema.PlatformAdmin = {
      id: admin.id || crypto.randomUUID(),
      email: admin.email.trim(),
      passwordHash: admin.passwordHash,
      totpSecret: admin.totpSecret ?? null,
      active: admin.active !== undefined ? admin.active : true,
      failedAttempts: admin.failedAttempts || 0,
      lockedUntil: admin.lockedUntil ?? null,
      createdAt: admin.createdAt || new Date(),
      updatedAt: admin.updatedAt || new Date(),
    };
    this.platformAdmins.push(fullAdmin);
    return { ...fullAdmin };
  }

  public async updatePlatformAdmin(
    id: string,
    updates: Partial<schema.PlatformAdmin>
  ): Promise<schema.PlatformAdmin> {
    await this.init();
    const index = this.platformAdmins.findIndex((a) => a.id === id);
    if (index === -1) throw new Error(`PlatformAdmin not found: ${id}`);
    const updated = {
      ...this.platformAdmins[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.platformAdmins[index] = updated;
    return { ...updated };
  }

  public async incrementPlatformAdminFailedLogin(
    id: string,
    lockedUntil: Date | null
  ): Promise<{ failedAttempts: number; lockedUntil: Date | null }> {
    await this.init();
    const index = this.platformAdmins.findIndex((a) => a.id === id);
    if (index === -1) throw new Error(`PlatformAdmin not found: ${id}`);
    const admin = this.platformAdmins[index];
    const nextAttempts = (admin.failedAttempts || 0) + 1;
    admin.failedAttempts = nextAttempts;
    admin.lockedUntil = lockedUntil;
    admin.updatedAt = new Date();
    return { failedAttempts: nextAttempts, lockedUntil };
  }

  public async resetPlatformAdminFailedLogin(id: string): Promise<void> {
    await this.init();
    const index = this.platformAdmins.findIndex((a) => a.id === id);
    if (index === -1) return;
    this.platformAdmins[index].failedAttempts = 0;
    this.platformAdmins[index].lockedUntil = null;
    this.platformAdmins[index].updatedAt = new Date();
  }

  public async insertAdminAudit(entry: schema.NewAdminAuditEntry): Promise<schema.AdminAuditEntry> {
    await this.init();
    const fullEntry: schema.AdminAuditEntry = {
      id: entry.id || crypto.randomUUID(),
      adminId: entry.adminId,
      action: entry.action,
      targetFirmId: entry.targetFirmId ?? null,
      old: (entry.old as Record<string, unknown> | null) ?? null,
      new: (entry.new as Record<string, unknown> | null) ?? null,
      ip: entry.ip ?? null,
      at: entry.at || new Date(),
    };
    this.adminAudits.push(fullEntry);
    return { ...fullEntry };
  }

  public async listAdminAudit(limit = 100, offset = 0): Promise<schema.AdminAuditEntry[]> {
    await this.init();
    return [...this.adminAudits]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(offset, offset + limit)
      .map((e) => ({ ...e }));
  }

  public async insertLicenseEvent(event: schema.NewLicenseEvent): Promise<schema.LicenseEvent> {
    await this.init();
    const newEvent: schema.LicenseEvent = {
      id: event.id || crypto.randomUUID(),
      firmId: event.firmId,
      type: event.type,
      old: (event.old as Record<string, unknown> | null) ?? null,
      new: (event.new as Record<string, unknown> | null) ?? null,
      byAdmin: event.byAdmin,
      at: event.at || new Date(),
    };
    this.licenseEvents.push(newEvent);
    return { ...newEvent };
  }

  public async listLicenseEvents(firmId?: string, limit = 50): Promise<schema.LicenseEvent[]> {
    await this.init();
    let list = [...this.licenseEvents];
    if (firmId) {
      list = list.filter((e) => e.firmId === firmId);
    }
    list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return list.slice(0, limit).map((e) => ({ ...e }));
  }

  public async insertPayment(payment: schema.NewPayment): Promise<schema.Payment> {
    await this.init();
    const newPayment: schema.Payment = {
      id: payment.id || `pay-${crypto.randomUUID()}`,
      firmId: payment.firmId,
      amount: payment.amount,
      method: payment.method,
      txnId: payment.txnId,
      note: payment.note ?? null,
      paidAt: payment.paidAt || new Date(),
      verifiedBy: payment.verifiedBy ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: payment.createdBy ?? null,
      updatedBy: payment.updatedBy ?? null,
    };
    this.payments.push(newPayment);
    return { ...newPayment };
  }

  public async listPayments(firmId: string): Promise<schema.Payment[]> {
    await this.init();
    return this.payments
      .filter((p) => p.firmId === firmId && !p.deletedAt)
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
      .map((p) => ({ ...p }));
  }

  public async getDeviceById(id: string): Promise<schema.Device | null> {
    await this.init();
    return this.devices.find((d) => d.id === id) || null;
  }

  public async getDeviceByHash(deviceKeyHash: string): Promise<schema.Device | null> {
    await this.init();
    return this.devices.find((d) => d.deviceKeyHash === deviceKeyHash) || null;
  }

  public async listDevices(firmId: string): Promise<schema.Device[]> {
    await this.init();
    return this.devices
      .filter((d) => d.firmId === firmId)
      .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
  }

  public async countApprovedDevices(firmId: string): Promise<number> {
    await this.init();
    return this.devices.filter((d) => d.firmId === firmId && d.status === 'approved').length;
  }

  public async countPendingDevices(firmId: string): Promise<number> {
    await this.init();
    return this.devices.filter((d) => d.firmId === firmId && d.status === 'pending').length;
  }

  public async insertDevice(device: schema.NewDevice): Promise<schema.Device> {
    await this.init();
    const created: schema.Device = {
      id: device.id || crypto.randomUUID(),
      firmId: device.firmId,
      userId: device.userId,
      deviceKeyHash: device.deviceKeyHash,
      name: device.name,
      userAgent: device.userAgent,
      status: device.status || 'pending',
      firstSeenAt: device.firstSeenAt ? new Date(device.firstSeenAt) : new Date(),
      lastSeenAt: device.lastSeenAt ? new Date(device.lastSeenAt) : new Date(),
      approvedByAdminId: device.approvedByAdminId || null,
    };
    this.devices.push(created);
    return created;
  }

  public async updateDevice(id: string, updates: Partial<schema.Device>): Promise<schema.Device> {
    await this.init();
    const index = this.devices.findIndex((d) => d.id === id);
    if (index === -1) {
      throw new Error(`Device not found: ${id}`);
    }
    const updated: schema.Device = {
      ...this.devices[index],
      ...updates,
    };
    this.devices[index] = updated;
    return updated;
  }

  public async deleteDevice(id: string): Promise<void> {
    await this.init();
    this.devices = this.devices.filter((d) => d.id !== id);
  }

  public async getFirmMetrics(
    firmId: string
  ): Promise<{ userCount: number; deviceCount: number; pendingDeviceCount: number; lastActivity: Date | null }> {
    await this.init();
    const userCount = this.users.filter((u) => u.firmId === firmId && !u.deletedAt).length;
    const approvedDevices = this.devices.filter((d) => d.firmId === firmId && d.status === 'approved').length;
    const pendingDeviceCount = this.devices.filter((d) => d.firmId === firmId && d.status === 'pending').length;
    
    // In memory: use approved device count if devices exist, fallback to IP approximation
    let deviceCount = approvedDevices;
    if (deviceCount === 0 && pendingDeviceCount === 0) {
      const sessionAudits = this.auditLogs.filter(
        (a) => a.firmId === firmId && a.entity === 'Session' && a.action === 'LOGIN_SUCCESS'
      );
      const ipSet = new Set<string>();
      sessionAudits.forEach((a) => {
        const ip = (a.newValue as any)?.ipAddress;
        if (ip) ipSet.add(ip);
      });
      deviceCount = ipSet.size > 0 ? ipSet.size : Math.max(1, userCount);
    }

    const firmAudits = this.auditLogs.filter((a) => a.firmId === firmId);
    let lastActivity: Date | null = null;
    if (firmAudits.length > 0) {
      const latestTimestamp = Math.max(...firmAudits.map((a) => new Date(a.timestamp).getTime()));
      lastActivity = new Date(latestTimestamp);
    } else {
      const firm = this.firms.find((f) => f.id === firmId);
      lastActivity = firm?.updatedAt || firm?.createdAt || null;
    }
    return { userCount, deviceCount, pendingDeviceCount, lastActivity };
  }

  public async transaction<T>(callback: (txDb: IDatabase) => Promise<T>): Promise<T> {
    await this.init();
    // Snapshot state for rollback on error
    const snapshot = {
      plans: [...this.plans],
      firms: [...this.firms],
      users: [...this.users],
      clients: [...this.clients],
      cases: [...this.cases],
      auditLogs: [...this.auditLogs],
      platformAdmins: [...this.platformAdmins],
      adminAudits: [...this.adminAudits],
      licenseEvents: [...this.licenseEvents],
      payments: [...this.payments],
      devices: [...this.devices],
    };

    try {
      return await callback(this);
    } catch (err) {
      // Rollback all tables to snapshot
      this.plans = snapshot.plans;
      this.firms = snapshot.firms;
      this.users = snapshot.users;
      this.clients = snapshot.clients;
      this.cases = snapshot.cases;
      this.auditLogs = snapshot.auditLogs;
      this.platformAdmins = snapshot.platformAdmins;
      this.adminAudits = snapshot.adminAudits;
      this.licenseEvents = snapshot.licenseEvents;
      this.payments = snapshot.payments;
      this.devices = snapshot.devices;
      throw err;
    }
  }
}

// PostgreSQL Database Adapter via Drizzle ORM
class PostgresDatabase implements IDatabase {
  private pool: pg.Pool;
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 3000 });
    this.db = drizzle(this.pool, { schema });
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const res = await this.pool.query('SELECT 1');
      return res.rowCount !== null && res.rowCount > 0;
    } catch {
      return false;
    }
  }

  public async getFirm(id: string, includeDeleted = false): Promise<schema.Firm | null> {
    const condition = includeDeleted
      ? eq(schema.firms.id, id)
      : and(eq(schema.firms.id, id), isNull(schema.firms.deletedAt));
    const rows = await this.db
      .select()
      .from(schema.firms)
      .where(condition)
      .limit(1);
    return rows[0] || null;
  }

  public async updateFirm(id: string, updates: Partial<schema.Firm>): Promise<schema.Firm> {
    const rows = await this.db
      .update(schema.firms)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.firms.id, id))
      .returning();
    if (!rows[0]) throw new Error(`Firm not found: ${id}`);
    return rows[0];
  }

  public async insertFirm(firm: schema.Firm | schema.NewFirm): Promise<schema.Firm> {
    const values = {
      ...firm,
      id: firm.id || `firm-${crypto.randomUUID()}`,
      firmId: firm.firmId || firm.id || `firm-${crypto.randomUUID()}`,
    };
    const rows = await this.db.insert(schema.firms).values(values as any).returning();
    return rows[0];
  }

  public async listFirms(query?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    includeDeleted?: boolean;
  }): Promise<{ firms: schema.Firm[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, query?.page || 1);
    const limit = Math.max(1, Math.min(100, query?.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (!query?.includeDeleted) {
      conditions.push(isNull(schema.firms.deletedAt));
    }
    if (query?.status && query.status !== 'all') {
      conditions.push(eq(schema.firms.status, query.status as any));
    }
    if (query?.search && query.search.trim()) {
      const q = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(schema.firms.name, q),
          ilike(schema.firms.firmId, q),
          ilike(schema.firms.contact, q),
          ilike(schema.firms.officeAddress, q),
          ilike(schema.firms.barCouncilReg, q)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRes = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.firms)
      .where(whereClause);
    const total = Number(totalRes[0]?.count || 0);

    const rows = await this.db
      .select()
      .from(schema.firms)
      .where(whereClause)
      .orderBy(desc(schema.firms.createdAt))
      .limit(limit)
      .offset(offset);

    return { firms: rows, total, page, limit };
  }

  public async getPlan(id: string): Promise<schema.Plan | null> {
    const rows = await this.db
      .select()
      .from(schema.plans)
      .where(and(eq(schema.plans.id, id), isNull(schema.plans.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  public async listPlans(): Promise<schema.Plan[]> {
    return this.db
      .select()
      .from(schema.plans)
      .where(isNull(schema.plans.deletedAt));
  }

  public async getUserByEmail(email: string): Promise<schema.User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.email, email.toLowerCase()), isNull(schema.users.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  public async getUserById(id: string): Promise<schema.User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  public async listUsers(firmId: string): Promise<schema.User[]> {
    return this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)));
  }

  public async insertUser(user: schema.User | schema.NewUser): Promise<schema.User> {
    const values = {
      ...user,
      id: user.id || `user-${crypto.randomUUID()}`,
    };
    const rows = await this.db.insert(schema.users).values(values as any).returning();
    return rows[0];
  }

  public async updateUser(id: string, updates: Partial<schema.User>): Promise<schema.User> {
    const rows = await this.db
      .update(schema.users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    if (!rows[0]) throw new Error(`User not found: ${id}`);
    return rows[0];
  }

  public async incrementFailedLogin(
    id: string,
    lockedUntil: Date | null
  ): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null }> {
    const res = await this.pool.query(
      `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING failed_login_attempts, locked_until`,
      [id, lockedUntil]
    );
    if (res.rows.length === 0) throw new Error(`User not found: ${id}`);
    return {
      failedLoginAttempts: res.rows[0].failed_login_attempts,
      lockedUntil: res.rows[0].locked_until,
    };
  }

  public async resetFailedLogin(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  public async insertAudit(entry: schema.AuditLogEntry): Promise<schema.AuditLogEntry> {
    const rows = await this.db.insert(schema.auditLog).values(entry).returning();
    return rows[0];
  }

  private async buildPostgresCaseCondition(
    firmId: string,
    user?: VisibilityUserContext,
    includeRestricted = true,
    includeDeleted = false
  ) {
    if (user) {
      const firm = (await this.getFirm(firmId)) || { id: firmId, visibilityMode: 'open' };
      const firmUsers = await this.listUsers(firmId);
      const visSql = buildCaseVisibilitySql(user, firm, firmUsers, includeDeleted);
      if (!includeRestricted) {
        return and(visSql, eq(schema.cases.restricted, false))!;
      }
      return visSql;
    }
    const base = [eq(schema.cases.firmId, firmId)];
    if (!includeDeleted) {
      base.push(isNull(schema.cases.deletedAt));
    }
    if (!includeRestricted) {
      base.push(eq(schema.cases.restricted, false));
    }
    return and(...base)!;
  }

  public async listAudit(
    firmId: string,
    limit = 100,
    offset = 0,
    includeRestricted = true,
    user?: VisibilityUserContext
  ): Promise<schema.AuditLogEntry[]> {
    const conditions = [eq(schema.auditLog.firmId, firmId)];
    if (user || !includeRestricted) {
      const caseCond = await this.buildPostgresCaseCondition(firmId, user, includeRestricted, true);
      conditions.push(
        sql`(${schema.auditLog.entity} != 'Case' OR ${schema.auditLog.entityId} IN (SELECT id FROM ${schema.cases} WHERE ${caseCond}))`
      );
    }
    return this.db
      .select()
      .from(schema.auditLog)
      .where(and(...conditions))
      .orderBy(desc(schema.auditLog.timestamp))
      .limit(limit)
      .offset(offset);
  }

  // Clients Methods
  public async listClients(firmId: string, search?: string): Promise<schema.Client[]> {
    const conditions = [eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(schema.clients.name, q),
          ilike(schema.clients.nameBn, q),
          ilike(schema.clients.phone, q),
          ilike(schema.clients.address, q)
        )!
      );
    }

    return this.db
      .select()
      .from(schema.clients)
      .where(and(...conditions))
      .orderBy(desc(schema.clients.createdAt));
  }

  public async getClientById(id: string, firmId: string): Promise<schema.Client | null> {
    const rows = await this.db
      .select()
      .from(schema.clients)
      .where(and(eq(schema.clients.id, id), eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  public async insertClient(client: schema.Client): Promise<schema.Client> {
    const rows = await this.db.insert(schema.clients).values(client).returning();
    return rows[0];
  }

  public async updateClient(id: string, firmId: string, updates: Partial<schema.Client>): Promise<schema.Client> {
    const rows = await this.db
      .update(schema.clients)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(schema.clients.id, id), eq(schema.clients.firmId, firmId)))
      .returning();
    if (!rows[0]) throw new Error(`Client not found: ${id}`);
    return rows[0];
  }

  public async countActiveCasesForClient(clientId: string, firmId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(schema.cases)
      .where(
        and(
          eq(schema.cases.clientId, clientId),
          eq(schema.cases.firmId, firmId),
          isNull(schema.cases.deletedAt),
          eq(schema.cases.status, 'ongoing')
        )
      );
    return rows.length;
  }

  public async getClientLinkedOverview(
    clientId: string,
    firmId: string,
    includeRestricted = true,
    user?: VisibilityUserContext
  ): Promise<ClientLinkedOverview> {
    const visCond = await this.buildPostgresCaseCondition(firmId, user, includeRestricted);
    const conditions = [
      eq(schema.cases.clientId, clientId),
      visCond,
    ];

    const clientCases = await this.db
      .select()
      .from(schema.cases)
      .where(and(...conditions));

    return {
      cases: clientCases.map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber,
        court: c.court,
        matterType: c.matterType,
        status: c.status === 'ongoing' ? 'Ongoing' : 'Closed',
      })),
      tasks: [],
      files: [],
    };
  }

  // Cases Methods
  public async listCases(
    firmId: string,
    filter?: {
      search?: string;
      status?: 'ongoing' | 'closed' | 'all';
      court?: string;
      matterType?: string;
      clientId?: string;
      includeRestricted?: boolean;
      user?: VisibilityUserContext;
      scope?: 'my' | 'team' | 'all';
    }
  ): Promise<schema.Case[]> {
    const visCond = await this.buildPostgresCaseCondition(
      firmId,
      filter?.user,
      filter?.includeRestricted ?? true
    );
    const conditions = [visCond];

    if (filter?.user && filter?.scope) {
      const uid = filter.user.id;
      if (filter.scope === 'my') {
        conditions.push(or(eq(schema.cases.responsibleLawyerId, uid), eq(schema.cases.createdBy, uid))!);
      } else if (filter.scope === 'team') {
        const firmUsers = await this.listUsers(firmId);
        const me = firmUsers.find((u) => u.id === uid);
        const teamIds = new Set<string>([uid]);
        if (me?.reportsToUserId) teamIds.add(me.reportsToUserId);
        for (const u of firmUsers) {
          if (u.reportsToUserId === uid) teamIds.add(u.id);
        }
        const teamArr = Array.from(teamIds);
        conditions.push(
          sql`${schema.cases.responsibleLawyerId} IN (${sql.join(
            teamArr.map((id) => sql`${id}`),
            sql`, `
          )})`
        );
      }
    }

    if (filter?.clientId) {
      conditions.push(eq(schema.cases.clientId, filter.clientId));
    }

    if (filter?.status && filter.status !== 'all') {
      conditions.push(eq(schema.cases.status, filter.status));
    }

    if (filter?.court && filter.court !== 'ALL') {
      conditions.push(ilike(schema.cases.court, `%${filter.court}%`));
    }

    if (filter?.matterType && filter.matterType !== 'ALL') {
      conditions.push(ilike(schema.cases.matterType, `%${filter.matterType}%`));
    }

    if (filter?.search && filter.search.trim()) {
      const q = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(schema.cases.caseNumber, q),
          ilike(schema.cases.plaintiff, q),
          ilike(schema.cases.defendant, q),
          ilike(schema.cases.court, q),
          ilike(schema.cases.matterType, q),
          ilike(schema.cases.fileSerial, q),
          ilike(schema.cases.plaintiffLawyer, q),
          ilike(schema.cases.defendantLawyer, q)
        )!
      );
    }

    return this.db
      .select()
      .from(schema.cases)
      .where(and(...conditions))
      .orderBy(desc(schema.cases.createdAt));
  }

  public async getCaseById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<schema.Case | null> {
    const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
    const rows = await this.db
      .select()
      .from(schema.cases)
      .where(and(eq(schema.cases.id, id), visCond))
      .limit(1);
    return rows[0] || null;
  }

  public async insertCase(c: schema.Case): Promise<schema.Case> {
    const rows = await this.db.insert(schema.cases).values(c).returning();
    return rows[0];
  }

  public async updateCase(id: string, firmId: string, updates: Partial<schema.Case>): Promise<schema.Case> {
    const rows = await this.db
      .update(schema.cases)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(schema.cases.id, id), eq(schema.cases.firmId, firmId)))
      .returning();
    if (!rows[0]) throw new Error(`Case not found: ${id}`);
    return rows[0];
  }

  public async checkDuplicateCase(
    firmId: string,
    caseNumber: string,
    court: string,
    excludeId?: string,
    includeRestricted = true,
    user?: VisibilityUserContext
  ): Promise<boolean> {
    const visCond = await this.buildPostgresCaseCondition(firmId, user, includeRestricted);
    const conditions = [
      visCond,
      ilike(schema.cases.caseNumber, caseNumber.trim()),
      ilike(schema.cases.court, court.trim()),
    ];
    if (excludeId) {
      conditions.push(ne(schema.cases.id, excludeId));
    }
    const rows = await this.db
      .select({ id: schema.cases.id })
      .from(schema.cases)
      .where(and(...conditions))
      .limit(1);
    return rows.length > 0;
  }

  public async getCaseLinkedCounts(caseId: string, firmId: string): Promise<CaseLinkedCounts> {
    const hearingsRows = await this.db
      .select({ id: schema.hearings.id })
      .from(schema.hearings)
      .where(
        and(
          eq(schema.hearings.caseId, caseId),
          eq(schema.hearings.firmId, firmId),
          isNull(schema.hearings.deletedAt)
        )
      );
    return {
      hearingsCount: hearingsRows.length,
      tasksCount: 0,
      filesCount: 0,
      remindersCount: 0,
    };
  }

  public async listCaseShares(caseId: string, firmId: string): Promise<schema.CaseShare[]> {
    return this.db
      .select()
      .from(schema.caseShares)
      .where(
        and(
          eq(schema.caseShares.caseId, caseId),
          eq(schema.caseShares.firmId, firmId),
          isNull(schema.caseShares.deletedAt)
        )
      );
  }

  public async listFirmCaseShares(firmId: string): Promise<schema.CaseShare[]> {
    return this.db
      .select()
      .from(schema.caseShares)
      .where(and(eq(schema.caseShares.firmId, firmId), isNull(schema.caseShares.deletedAt)));
  }

  public async insertCaseShare(share: schema.NewCaseShare): Promise<schema.CaseShare> {
    const existing = await this.db
      .select()
      .from(schema.caseShares)
      .where(
        and(
          eq(schema.caseShares.caseId, share.caseId),
          eq(schema.caseShares.userId, share.userId),
          eq(schema.caseShares.firmId, share.firmId),
          isNull(schema.caseShares.deletedAt)
        )
      )
      .limit(1);
    if (existing[0]) return existing[0];
    const rows = await this.db
      .insert(schema.caseShares)
      .values({
        ...share,
        id: share.id || `share-${crypto.randomUUID()}`,
      })
      .returning();
    return rows[0];
  }

  public async deleteCaseShare(id: string, firmId: string): Promise<void> {
    await this.db
      .update(schema.caseShares)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.caseShares.id, id), eq(schema.caseShares.firmId, firmId)));
  }

  public async listHearings(firmId: string, user?: VisibilityUserContext): Promise<schema.Hearing[]> {
    const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
    return this.db
      .select()
      .from(schema.hearings)
      .where(
        and(
          eq(schema.hearings.firmId, firmId),
          isNull(schema.hearings.deletedAt),
          sql`${schema.hearings.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond})`
        )
      );
  }

  public async insertHearing(hearing: schema.NewHearing): Promise<schema.Hearing> {
    const rows = await this.db
      .insert(schema.hearings)
      .values({
        ...hearing,
        id: hearing.id || `hearing-${crypto.randomUUID()}`,
      })
      .returning();
    return rows[0];
  }

  public async updateHearing(id: string, firmId: string, updates: Partial<schema.Hearing>): Promise<schema.Hearing> {
    const rows = await this.db
      .update(schema.hearings)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(schema.hearings.id, id), eq(schema.hearings.firmId, firmId), isNull(schema.hearings.deletedAt)))
      .returning();
    if (!rows[0]) throw new Error(`Hearing not found: ${id}`);
    return rows[0];
  }

  public async getPlatformAdminByEmail(email: string): Promise<schema.PlatformAdmin | null> {
    const rows = await this.db
      .select()
      .from(schema.platformAdmins)
      .where(ilike(schema.platformAdmins.email, email.trim()))
      .limit(1);
    return rows[0] || null;
  }

  public async getPlatformAdminById(id: string): Promise<schema.PlatformAdmin | null> {
    const rows = await this.db
      .select()
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.id, id))
      .limit(1);
    return rows[0] || null;
  }

  public async listPlatformAdmins(): Promise<schema.PlatformAdmin[]> {
    return this.db
      .select()
      .from(schema.platformAdmins)
      .orderBy(desc(schema.platformAdmins.createdAt));
  }

  public async insertPlatformAdmin(admin: schema.NewPlatformAdmin): Promise<schema.PlatformAdmin> {
    const rows = await this.db.insert(schema.platformAdmins).values(admin).returning();
    return rows[0];
  }

  public async updatePlatformAdmin(
    id: string,
    updates: Partial<schema.PlatformAdmin>
  ): Promise<schema.PlatformAdmin> {
    const rows = await this.db
      .update(schema.platformAdmins)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.platformAdmins.id, id))
      .returning();
    if (!rows[0]) throw new Error(`PlatformAdmin not found: ${id}`);
    return rows[0];
  }

  public async incrementPlatformAdminFailedLogin(
    id: string,
    lockedUntil: Date | null
  ): Promise<{ failedAttempts: number; lockedUntil: Date | null }> {
    const res = await this.pool.query(
      `UPDATE platform_admins
       SET failed_attempts = failed_attempts + 1,
           locked_until = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING failed_attempts, locked_until`,
      [id, lockedUntil]
    );
    if (!res.rows[0]) throw new Error(`PlatformAdmin not found: ${id}`);
    return {
      failedAttempts: res.rows[0].failed_attempts,
      lockedUntil: res.rows[0].locked_until,
    };
  }

  public async resetPlatformAdminFailedLogin(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE platform_admins
       SET failed_attempts = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  public async insertAdminAudit(entry: schema.NewAdminAuditEntry): Promise<schema.AdminAuditEntry> {
    const rows = await this.db.insert(schema.adminAudit).values(entry).returning();
    return rows[0];
  }

  public async listAdminAudit(limit = 100, offset = 0): Promise<schema.AdminAuditEntry[]> {
    return this.db
      .select()
      .from(schema.adminAudit)
      .orderBy(desc(schema.adminAudit.at))
      .limit(limit)
      .offset(offset);
  }

  public async insertLicenseEvent(event: schema.NewLicenseEvent): Promise<schema.LicenseEvent> {
    const rows = await this.db.insert(schema.licenseEvents).values(event).returning();
    return rows[0];
  }

  public async listLicenseEvents(firmId?: string, limit = 50): Promise<schema.LicenseEvent[]> {
    if (firmId) {
      return this.db
        .select()
        .from(schema.licenseEvents)
        .where(eq(schema.licenseEvents.firmId, firmId))
        .orderBy(desc(schema.licenseEvents.at))
        .limit(limit);
    }
    return this.db
      .select()
      .from(schema.licenseEvents)
      .orderBy(desc(schema.licenseEvents.at))
      .limit(limit);
  }

  public async insertPayment(payment: schema.NewPayment): Promise<schema.Payment> {
    const values = {
      ...payment,
      id: payment.id || `pay-${crypto.randomUUID()}`,
    };
    const rows = await this.db.insert(schema.payments).values(values as any).returning();
    return rows[0];
  }

  public async listPayments(firmId: string): Promise<schema.Payment[]> {
    return this.db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.firmId, firmId), isNull(schema.payments.deletedAt)))
      .orderBy(desc(schema.payments.paidAt));
  }

  public async getDeviceById(id: string): Promise<schema.Device | null> {
    const res = await this.db.select().from(schema.devices).where(eq(schema.devices.id, id));
    return res[0] || null;
  }

  public async getDeviceByHash(deviceKeyHash: string): Promise<schema.Device | null> {
    const res = await this.db.select().from(schema.devices).where(eq(schema.devices.deviceKeyHash, deviceKeyHash));
    return res[0] || null;
  }

  public async listDevices(firmId: string): Promise<schema.Device[]> {
    return this.db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.firmId, firmId))
      .orderBy(desc(schema.devices.lastSeenAt));
  }

  public async countApprovedDevices(firmId: string): Promise<number> {
    const res = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.devices)
      .where(and(eq(schema.devices.firmId, firmId), eq(schema.devices.status, 'approved')));
    return Number(res[0]?.count || 0);
  }

  public async countPendingDevices(firmId: string): Promise<number> {
    const res = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.devices)
      .where(and(eq(schema.devices.firmId, firmId), eq(schema.devices.status, 'pending')));
    return Number(res[0]?.count || 0);
  }

  public async insertDevice(device: schema.NewDevice): Promise<schema.Device> {
    const res = await this.db.insert(schema.devices).values(device).returning();
    return res[0];
  }

  public async updateDevice(id: string, updates: Partial<schema.Device>): Promise<schema.Device> {
    const res = await this.db
      .update(schema.devices)
      .set(updates)
      .where(eq(schema.devices.id, id))
      .returning();
    return res[0];
  }

  public async deleteDevice(id: string): Promise<void> {
    await this.db.delete(schema.devices).where(eq(schema.devices.id, id));
  }

  public async getFirmMetrics(
    firmId: string
  ): Promise<{ userCount: number; deviceCount: number; pendingDeviceCount: number; lastActivity: Date | null }> {
    const usersCountRes = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(and(eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)));
    const userCount = Number(usersCountRes[0]?.count || 0);

    const approvedDevicesRes = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.devices)
      .where(and(eq(schema.devices.firmId, firmId), eq(schema.devices.status, 'approved')));
    let deviceCount = Number(approvedDevicesRes[0]?.count || 0);

    const pendingDevicesRes = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.devices)
      .where(and(eq(schema.devices.firmId, firmId), eq(schema.devices.status, 'pending')));
    const pendingDeviceCount = Number(pendingDevicesRes[0]?.count || 0);

    if (deviceCount === 0 && pendingDeviceCount === 0) {
      const distinctIpRes = await this.pool.query(
        `SELECT COUNT(DISTINCT (new_value->>'ipAddress')) as count
         FROM audit_log
         WHERE firm_id = $1 AND entity = 'Session' AND action = 'LOGIN_SUCCESS' AND (new_value->>'ipAddress') IS NOT NULL`,
        [firmId]
      );
      const ipCount = Number(distinctIpRes.rows[0]?.count || 0);
      deviceCount = ipCount > 0 ? ipCount : Math.max(1, userCount);
    }

    const latestAuditRes = await this.pool.query(
      `SELECT timestamp FROM audit_log WHERE firm_id = $1 ORDER BY timestamp DESC LIMIT 1`,
      [firmId]
    );
    let lastActivity: Date | null = null;
    if (latestAuditRes.rows[0]?.timestamp) {
      lastActivity = new Date(latestAuditRes.rows[0].timestamp);
    } else {
      const firm = await this.getFirm(firmId, true);
      lastActivity = firm?.updatedAt || firm?.createdAt || null;
    }

    return { userCount, deviceCount, pendingDeviceCount, lastActivity };
  }

  public async transaction<T>(callback: (txDb: IDatabase) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txDrizzle = drizzle(client, { schema });
      // Create a scoped PostgresDatabase instance wrapping client/txDrizzle
      const txAdapter = Object.create(this) as PostgresDatabase;
      (txAdapter as any).pool = client;
      (txAdapter as any).db = txDrizzle;
      const result = await callback(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

// Factory returning Postgres DB or In-Memory fallback
let instance: IDatabase | null = null;

export function getDatabase(): IDatabase {
  if (instance) return instance;

  const url = process.env.DATABASE_URL;
  if (url && (process.env.USE_POSTGRES === 'true' || process.env.NODE_ENV !== 'test')) {
    instance = new PostgresDatabase(url);
  } else {
    instance = new MemoryDatabase();
  }

  return instance;
}

export function createMemoryDatabase(): MemoryDatabase {
  return new MemoryDatabase();
}

export function createPostgresDatabase(url: string): IDatabase {
  return new PostgresDatabase(url);
}

export function resetDatabaseInstance(): void {
  instance = null;
}
