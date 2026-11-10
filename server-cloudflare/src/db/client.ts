import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import { eq, and, sql, desc, asc, isNull, inArray } from 'drizzle-orm';
import * as schema from './schema';

export type D1Client = DrizzleD1Database<typeof schema>;

export function getDb(d1: D1Database): D1Client {
  return drizzle(d1, { schema });
}

export class ChamberDatabase {
  db: D1Client;
  d1: D1Database;

  constructor(db: D1Client, d1: D1Database) {
    this.db = db;
    this.d1 = d1;
  }

  // ==========================================
  // USERS & AUTH
  // ==========================================
  async getUserByEmail(email: string) {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.email, email.toLowerCase().trim()), isNull(schema.users.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  async getUserById(id: string, firmId?: string) {
    const conditions = [eq(schema.users.id, id), isNull(schema.users.deletedAt)];
    if (firmId) conditions.push(eq(schema.users.firmId, firmId));

    const rows = await this.db
      .select()
      .from(schema.users)
      .where(and(...conditions))
      .limit(1);
    return rows[0] || null;
  }

  async listUsersByFirm(firmId: string) {
    return this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)))
      .orderBy(asc(schema.users.name));
  }

  // ==========================================
  // FIRMS
  // ==========================================
  async getFirmById(firmId: string) {
    const rows = await this.db
      .select()
      .from(schema.firms)
      .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  async listFirms() {
    return this.db
      .select()
      .from(schema.firms)
      .where(isNull(schema.firms.deletedAt))
      .orderBy(desc(schema.firms.createdAt));
  }

  // ==========================================
  // PLATFORM ADMINS
  // ==========================================
  async getAdminByEmail(email: string) {
    const rows = await this.db
      .select()
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.email, email.toLowerCase().trim()))
      .limit(1);
    return rows[0] || null;
  }

  async getAdminById(id: string) {
    const rows = await this.db
      .select()
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.id, id))
      .limit(1);
    return rows[0] || null;
  }

  // ==========================================
  // CLIENTS
  // ==========================================
  async listClients(firmId: string, options: { search?: string; limit?: number; offset?: number } = {}) {
    const conditions = [eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)];
    if (options.search) {
      const q = `%${options.search}%`;
      conditions.push(sql`(${schema.clients.name} LIKE ${q} COLLATE NOCASE OR ${schema.clients.phone} LIKE ${q})`);
    }

    return this.db
      .select()
      .from(schema.clients)
      .where(and(...conditions))
      .limit(options.limit || 50)
      .offset(options.offset || 0)
      .orderBy(asc(schema.clients.name));
  }

  async getClientById(id: string, firmId: string) {
    const rows = await this.db
      .select()
      .from(schema.clients)
      .where(and(eq(schema.clients.id, id), eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  // ==========================================
  // CASES
  // ==========================================
  async listCases(firmId: string, options: { status?: string; clientId?: string; limit?: number; offset?: number } = {}) {
    const conditions = [eq(schema.cases.firmId, firmId), isNull(schema.cases.deletedAt)];
    if (options.status) conditions.push(eq(schema.cases.status, options.status as any));
    if (options.clientId) conditions.push(eq(schema.cases.clientId, options.clientId));

    return this.db
      .select()
      .from(schema.cases)
      .where(and(...conditions))
      .limit(options.limit || 50)
      .offset(options.offset || 0)
      .orderBy(desc(schema.cases.createdAt));
  }

  async getCaseById(id: string, firmId: string) {
    const rows = await this.db
      .select()
      .from(schema.cases)
      .where(and(eq(schema.cases.id, id), eq(schema.cases.firmId, firmId), isNull(schema.cases.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  // ==========================================
  // HEARINGS & CALENDAR
  // ==========================================
  async listHearings(firmId: string, options: { caseId?: string; fromDate?: string; toDate?: string } = {}) {
    const conditions = [eq(schema.hearings.firmId, firmId), isNull(schema.hearings.deletedAt)];
    if (options.caseId) conditions.push(eq(schema.hearings.caseId, options.caseId));
    if (options.fromDate) conditions.push(sql`${schema.hearings.scheduledAt} >= ${options.fromDate}`);
    if (options.toDate) conditions.push(sql`${schema.hearings.scheduledAt} <= ${options.toDate}`);

    return this.db
      .select()
      .from(schema.hearings)
      .where(and(...conditions))
      .orderBy(asc(schema.hearings.scheduledAt));
  }

  async getHearingById(id: string, firmId: string) {
    const rows = await this.db
      .select()
      .from(schema.hearings)
      .where(and(eq(schema.hearings.id, id), eq(schema.hearings.firmId, firmId), isNull(schema.hearings.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  // ==========================================
  // NUMBER SEQUENCES & ATOMIC RECEIPT NUMBERS
  // ==========================================
  async getNextReceiptNumber(firmId: string, year = new Date().getFullYear()): Promise<string> {
    const type = `FEE_PAYMENT_${year}`;
    const prefix = `REC-${year}-`;

    // Atomic SQLite upsert increment
    await this.d1.prepare(`
      INSERT INTO number_sequences (id, firm_id, type, prefix, current_val, updated_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT (firm_id, type)
      DO UPDATE SET current_val = number_sequences.current_val + 1, updated_at = datetime('now')
    `).bind(crypto.randomUUID(), firmId, type, prefix).run();

    const seqRow = await this.db
      .select({ val: schema.numberSequences.currentVal })
      .from(schema.numberSequences)
      .where(and(eq(schema.numberSequences.firmId, firmId), eq(schema.numberSequences.type, type)))
      .limit(1);

    const num = seqRow[0]?.val || 1;
    return `${prefix}${String(num).padStart(5, '0')}`;
  }

  // ==========================================
  // AUDIT LOG
  // ==========================================
  async listAuditLogs(firmId: string, limit = 50, offset = 0) {
    return this.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.firmId, firmId))
      .orderBy(desc(schema.auditLog.timestamp))
      .limit(limit)
      .offset(offset);
  }
}
