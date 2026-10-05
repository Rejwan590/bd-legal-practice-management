import pg from 'pg';
import crypto from 'crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, desc, or, ilike, ne } from 'drizzle-orm';
import * as schema from './schema.js';
import { getSeedUsers, SEED_FIRMS, SEED_PLANS, SEED_CLIENTS, SEED_CASES } from './seed.js';

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
  getFirm(id: string): Promise<schema.Firm | null>;
  updateFirm(id: string, updates: Partial<schema.Firm>): Promise<schema.Firm>;
  insertFirm(firm: schema.Firm): Promise<schema.Firm>;
  getUserByEmail(email: string): Promise<schema.User | null>;
  getUserById(id: string): Promise<schema.User | null>;
  listUsers(firmId: string): Promise<schema.User[]>;
  insertUser(user: schema.User): Promise<schema.User>;
  updateUser(id: string, updates: Partial<schema.User>): Promise<schema.User>;
  incrementFailedLogin(
    id: string,
    lockedUntil: Date | null
  ): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null }>;
  resetFailedLogin(id: string): Promise<void>;
  insertAudit(entry: schema.AuditLogEntry): Promise<schema.AuditLogEntry>;
  listAudit(firmId: string, limit?: number, offset?: number): Promise<schema.AuditLogEntry[]>;
  // Clients (Step 3.1)
  listClients(firmId: string, search?: string): Promise<schema.Client[]>;
  getClientById(id: string): Promise<schema.Client | null>;
  insertClient(client: schema.Client): Promise<schema.Client>;
  updateClient(id: string, updates: Partial<schema.Client>): Promise<schema.Client>;
  countActiveCasesForClient(clientId: string): Promise<number>;
  getClientLinkedOverview(clientId: string, firmId: string, includeRestricted?: boolean): Promise<ClientLinkedOverview>;
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
    }
  ): Promise<schema.Case[]>;
  getCaseById(id: string): Promise<schema.Case | null>;
  insertCase(c: schema.Case): Promise<schema.Case>;
  updateCase(id: string, updates: Partial<schema.Case>): Promise<schema.Case>;
  checkDuplicateCase(
    firmId: string,
    caseNumber: string,
    court: string,
    excludeId?: string
  ): Promise<boolean>;
  getCaseLinkedCounts(caseId: string, firmId: string): Promise<CaseLinkedCounts>;
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
}

// In-Memory Database Adapter (for headless testing and local development without active Docker container)
class MemoryDatabase implements IDatabase {
  public plans: schema.Plan[] = [];
  public firms: schema.Firm[] = [];
  public users: schema.User[] = [];
  public clients: schema.Client[] = [];
  public cases: schema.Case[] = [];
  public auditLogs: schema.AuditLogEntry[] = [];
  public platformAdmins: schema.PlatformAdmin[] = [];
  public adminAudits: schema.AdminAuditEntry[] = [];
  private initialized = false;

  public async init() {
    if (this.initialized) return;
    this.plans = [...SEED_PLANS];
    this.firms = [...SEED_FIRMS];
    this.users = await getSeedUsers();
    this.clients = [...SEED_CLIENTS];
    this.cases = [...SEED_CASES];
    this.initialized = true;
  }

  public async isHealthy(): Promise<boolean> {
    return true;
  }

  public async getFirm(id: string): Promise<schema.Firm | null> {
    await this.init();
    const firm = this.firms.find((f) => f.id === id && !f.deletedAt);
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

  public async insertFirm(firm: schema.Firm): Promise<schema.Firm> {
    await this.init();
    this.firms.push({ ...firm });
    return { ...firm };
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

  public async insertUser(user: schema.User): Promise<schema.User> {
    await this.init();
    this.users.push({ ...user });
    return { ...user };
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

  public async listAudit(firmId: string, limit = 100, offset = 0): Promise<schema.AuditLogEntry[]> {
    await this.init();
    return this.auditLogs
      .filter((a) => a.firmId === firmId)
      .slice(offset, offset + limit)
      .map((a) => ({ ...a }));
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

  public async getClientById(id: string): Promise<schema.Client | null> {
    await this.init();
    const c = this.clients.find((x) => x.id === id && !x.deletedAt);
    return c ? { ...c } : null;
  }

  public async insertClient(client: schema.Client): Promise<schema.Client> {
    await this.init();
    this.clients.unshift({ ...client });
    return { ...client };
  }

  public async updateClient(id: string, updates: Partial<schema.Client>): Promise<schema.Client> {
    await this.init();
    const index = this.clients.findIndex((c) => c.id === id);
    if (index === -1) throw new Error(`Client not found: ${id}`);
    const updated = {
      ...this.clients[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.clients[index] = updated;
    return { ...updated };
  }

  public async countActiveCasesForClient(clientId: string): Promise<number> {
    await this.init();
    return this.cases.filter(
      (c) => c.clientId === clientId && !c.deletedAt && c.status === 'ongoing'
    ).length;
  }

  public async getClientLinkedOverview(clientId: string, firmId: string, includeRestricted = true): Promise<ClientLinkedOverview> {
    await this.init();
    const clientCases = this.cases.filter(
      (c) => c.clientId === clientId && c.firmId === firmId && !c.deletedAt && (includeRestricted || !c.restricted)
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
    }
  ): Promise<schema.Case[]> {
    await this.init();
    let res = this.cases.filter((c) => c.firmId === firmId && !c.deletedAt);

    if (!filter?.includeRestricted) {
      res = res.filter((c) => !c.restricted);
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

  public async getCaseById(id: string): Promise<schema.Case | null> {
    await this.init();
    const c = this.cases.find((x) => x.id === id && !x.deletedAt);
    return c ? { ...c } : null;
  }

  public async insertCase(c: schema.Case): Promise<schema.Case> {
    await this.init();
    this.cases.unshift({ ...c });
    return { ...c };
  }

  public async updateCase(id: string, updates: Partial<schema.Case>): Promise<schema.Case> {
    await this.init();
    const index = this.cases.findIndex((c) => c.id === id);
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
    excludeId?: string
  ): Promise<boolean> {
    await this.init();
    const cleanNum = caseNumber.trim().toLowerCase();
    const cleanCourt = court.trim().toLowerCase();

    return this.cases.some(
      (c) =>
        c.firmId === firmId &&
        !c.deletedAt &&
        c.id !== excludeId &&
        c.caseNumber.trim().toLowerCase() === cleanNum &&
        c.court.trim().toLowerCase() === cleanCourt
    );
  }

  public async getCaseLinkedCounts(caseId: string, firmId: string): Promise<CaseLinkedCounts> {
    await this.init();
    return {
      hearingsCount: 0,
      tasksCount: 0,
      filesCount: 0,
      remindersCount: 0,
    };
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

  public async getFirm(id: string): Promise<schema.Firm | null> {
    const rows = await this.db
      .select()
      .from(schema.firms)
      .where(and(eq(schema.firms.id, id), isNull(schema.firms.deletedAt)))
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

  public async insertFirm(firm: schema.Firm): Promise<schema.Firm> {
    const rows = await this.db.insert(schema.firms).values(firm).returning();
    return rows[0];
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

  public async insertUser(user: schema.User): Promise<schema.User> {
    const rows = await this.db.insert(schema.users).values(user).returning();
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

  public async listAudit(firmId: string, limit = 100, offset = 0): Promise<schema.AuditLogEntry[]> {
    return this.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.firmId, firmId))
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

  public async getClientById(id: string): Promise<schema.Client | null> {
    const rows = await this.db
      .select()
      .from(schema.clients)
      .where(and(eq(schema.clients.id, id), isNull(schema.clients.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  public async insertClient(client: schema.Client): Promise<schema.Client> {
    const rows = await this.db.insert(schema.clients).values(client).returning();
    return rows[0];
  }

  public async updateClient(id: string, updates: Partial<schema.Client>): Promise<schema.Client> {
    const rows = await this.db
      .update(schema.clients)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.clients.id, id))
      .returning();
    if (!rows[0]) throw new Error(`Client not found: ${id}`);
    return rows[0];
  }

  public async countActiveCasesForClient(clientId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(schema.cases)
      .where(
        and(
          eq(schema.cases.clientId, clientId),
          isNull(schema.cases.deletedAt),
          eq(schema.cases.status, 'ongoing')
        )
      );
    return rows.length;
  }

  public async getClientLinkedOverview(clientId: string, firmId: string, includeRestricted = true): Promise<ClientLinkedOverview> {
    const conditions = [
      eq(schema.cases.clientId, clientId),
      eq(schema.cases.firmId, firmId),
      isNull(schema.cases.deletedAt),
    ];
    if (!includeRestricted) {
      conditions.push(eq(schema.cases.restricted, false));
    }

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
    }
  ): Promise<schema.Case[]> {
    const conditions = [
      eq(schema.cases.firmId, firmId),
      isNull(schema.cases.deletedAt),
    ];

    if (!filter?.includeRestricted) {
      conditions.push(eq(schema.cases.restricted, false));
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

  public async getCaseById(id: string): Promise<schema.Case | null> {
    const rows = await this.db
      .select()
      .from(schema.cases)
      .where(and(eq(schema.cases.id, id), isNull(schema.cases.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  public async insertCase(c: schema.Case): Promise<schema.Case> {
    const rows = await this.db.insert(schema.cases).values(c).returning();
    return rows[0];
  }

  public async updateCase(id: string, updates: Partial<schema.Case>): Promise<schema.Case> {
    const rows = await this.db
      .update(schema.cases)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.cases.id, id))
      .returning();
    if (!rows[0]) throw new Error(`Case not found: ${id}`);
    return rows[0];
  }

  public async checkDuplicateCase(
    firmId: string,
    caseNumber: string,
    court: string,
    excludeId?: string
  ): Promise<boolean> {
    const conditions = [
      eq(schema.cases.firmId, firmId),
      isNull(schema.cases.deletedAt),
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
    return {
      hearingsCount: 0,
      tasksCount: 0,
      filesCount: 0,
      remindersCount: 0,
    };
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
