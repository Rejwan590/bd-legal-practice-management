import { and, eq, isNull } from 'drizzle-orm';
import type { D1Client } from '../db/client';
import * as schema from '../db/schema';

export type AgreementRecord = typeof schema.feeAgreements.$inferSelect & {
  clientName?: string;
  clientNameBn?: string | null;
  caseNumber?: string | null;
  caseTitle?: string | null;
  paidPaisa: number;
  outstandingPaisa: number;
  creditPaisa: number;
};

export type PaymentRecord = typeof schema.feePayments.$inferSelect & {
  clientName?: string;
  clientNameBn?: string | null;
  caseNumber?: string | null;
  caseTitle?: string | null;
  agreementFeeType?: string | null;
  agreementAmountPaisa?: number | null;
};

export type ExpenseRecord = typeof schema.expenses.$inferSelect & {
  categoryName?: string;
  clientName?: string | null;
  clientNameBn?: string | null;
  caseNumber?: string | null;
  caseTitle?: string | null;
};

export function computeAgreementBalance(agreedAmountPaisa: number, paidPaisa: number, status: string) {
  if (status === 'void') {
    return { paidPaisa, outstandingPaisa: 0, creditPaisa: 0 };
  }
  const diff = agreedAmountPaisa - paidPaisa;
  return {
    paidPaisa,
    outstandingPaisa: diff > 0 ? diff : 0,
    creditPaisa: diff < 0 ? Math.abs(diff) : 0,
  };
}

export async function loadFirmBillingContext(db: D1Client, firmId: string) {
  const [clientsList, casesList] = await Promise.all([
    db
      .select({
        id: schema.clients.id,
        name: schema.clients.name,
        nameBn: schema.clients.nameBn,
      })
      .from(schema.clients)
      .where(and(eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt))),
    db
      .select({
        id: schema.cases.id,
        caseNumber: schema.cases.caseNumber,
        matterType: schema.cases.matterType,
        description: schema.cases.description,
      })
      .from(schema.cases)
      .where(and(eq(schema.cases.firmId, firmId), isNull(schema.cases.deletedAt))),
  ]);

  const clientMap = new Map(clientsList.map((cl) => [cl.id, cl]));
  const caseMap = new Map(casesList.map((cs) => [cs.id, cs]));
  return { clientMap, caseMap };
}

export function formatCaseTitle(cs?: { matterType: string; description: string | null } | null): string | null {
  if (!cs) return null;
  return cs.matterType || cs.description || null;
}

export async function enrichAgreements(
  db: D1Client,
  firmId: string,
  rows: Array<typeof schema.feeAgreements.$inferSelect>
): Promise<AgreementRecord[]> {
  if (rows.length === 0) return [];
  const [{ clientMap, caseMap }, postedPayments] = await Promise.all([
    loadFirmBillingContext(db, firmId),
    db
      .select({
        feeAgreementId: schema.feePayments.feeAgreementId,
        amountPaisa: schema.feePayments.amountPaisa,
      })
      .from(schema.feePayments)
      .where(
        and(
          eq(schema.feePayments.firmId, firmId),
          eq(schema.feePayments.status, 'posted'),
          isNull(schema.feePayments.deletedAt)
        )
      ),
  ]);

  const paidByAgreement = new Map<string, number>();
  for (const p of postedPayments) {
    if (!p.feeAgreementId) continue;
    paidByAgreement.set(p.feeAgreementId, (paidByAgreement.get(p.feeAgreementId) || 0) + p.amountPaisa);
  }

  return rows.map((agr) => {
    const cl = clientMap.get(agr.clientId);
    const cs = agr.caseId ? caseMap.get(agr.caseId) : undefined;
    const paidPaisa = paidByAgreement.get(agr.id) || 0;
    const bal = computeAgreementBalance(agr.agreedAmountPaisa, paidPaisa, agr.status);
    return {
      ...agr,
      clientName: cl?.name,
      clientNameBn: cl?.nameBn ?? null,
      caseNumber: cs?.caseNumber ?? null,
      caseTitle: formatCaseTitle(cs),
      paidPaisa: bal.paidPaisa,
      outstandingPaisa: bal.outstandingPaisa,
      creditPaisa: bal.creditPaisa,
    };
  });
}

export async function enrichPayments(
  db: D1Client,
  firmId: string,
  rows: Array<typeof schema.feePayments.$inferSelect>
): Promise<PaymentRecord[]> {
  if (rows.length === 0) return [];
  const [{ clientMap, caseMap }, agreements] = await Promise.all([
    loadFirmBillingContext(db, firmId),
    db
      .select({
        id: schema.feeAgreements.id,
        feeType: schema.feeAgreements.feeType,
        agreedAmountPaisa: schema.feeAgreements.agreedAmountPaisa,
      })
      .from(schema.feeAgreements)
      .where(and(eq(schema.feeAgreements.firmId, firmId), isNull(schema.feeAgreements.deletedAt))),
  ]);

  const agreementMap = new Map(agreements.map((a) => [a.id, a]));

  return rows.map((pay) => {
    const cl = clientMap.get(pay.clientId);
    const cs = pay.caseId ? caseMap.get(pay.caseId) : undefined;
    const agr = pay.feeAgreementId ? agreementMap.get(pay.feeAgreementId) : undefined;
    return {
      ...pay,
      clientName: cl?.name,
      clientNameBn: cl?.nameBn ?? null,
      caseNumber: cs?.caseNumber ?? null,
      caseTitle: formatCaseTitle(cs),
      agreementFeeType: agr?.feeType ?? null,
      agreementAmountPaisa: agr?.agreedAmountPaisa ?? null,
    };
  });
}

export async function enrichExpenses(
  db: D1Client,
  firmId: string,
  rows: Array<typeof schema.expenses.$inferSelect>,
  categoryMap?: Map<string, string>
): Promise<ExpenseRecord[]> {
  if (rows.length === 0) return [];
  const [{ clientMap, caseMap }, cats] = await Promise.all([
    loadFirmBillingContext(db, firmId),
    categoryMap
      ? Promise.resolve(null)
      : db
          .select({ id: schema.expenseCategories.id, name: schema.expenseCategories.name })
          .from(schema.expenseCategories)
          .where(and(eq(schema.expenseCategories.firmId, firmId), isNull(schema.expenseCategories.deletedAt))),
  ]);

  const resolvedCatMap = categoryMap || new Map((cats || []).map((cat) => [cat.id, cat.name]));

  return rows.map((exp) => {
    const cl = exp.clientId ? clientMap.get(exp.clientId) : undefined;
    const cs = exp.caseId ? caseMap.get(exp.caseId) : undefined;
    return {
      ...exp,
      categoryName: resolvedCatMap.get(exp.categoryId) || undefined,
      clientName: cl?.name ?? null,
      clientNameBn: cl?.nameBn ?? null,
      caseNumber: cs?.caseNumber ?? null,
      caseTitle: formatCaseTitle(cs),
    };
  });
}
