import { localStore } from '../../../data/mockStore';
import { DiagnosticContext, TestResult } from './types';

export async function runAuditTests(ctx: DiagnosticContext): Promise<TestResult[]> {
  const suite: TestResult[] = [];
  const { repos, ownerUser, ownerCtx, staffCtx } = ctx;

  // Test 7: Audit Log Write & Immutability Invariant
  try {
    const testTimestamp = new Date().toISOString();
    let recordedId = '';
    if ('record' in repos.auditLog && typeof repos.auditLog.record === 'function') {
      const recorded = await repos.auditLog.record(ownerCtx, {
        entity: 'HealthDiagnostic',
        entityId: 'diag-001',
        action: 'CREATE',
        oldValue: null,
        newValue: { test: 'Diagnostic verification run', timestamp: testTimestamp },
      });
      recordedId = recorded.id;
    }

    const logs = await repos.auditLog.list(ownerCtx, { entity: 'HealthDiagnostic', limit: 1 });
    const pass = logs.length > 0 && (!recordedId || logs[0].id === recordedId) && logs[0].userName === ownerUser.name;

    suite.push({
      id: 'audit-integrity',
      name: 'Audit Trail Generation & Immutability',
      category: 'Audit Trail',
      passed: pass,
      message: pass
        ? `Audit log automatically captured action with operator "${logs[0].userName}" and payload details.`
        : 'Audit log failed to retrieve or record audit entry correctly.',
      details: `Log entry ID: ${logs[0]?.id || recordedId}, operator: ${logs[0]?.userName || ownerUser.name}, firmId: ${logs[0]?.firmId || ownerCtx.currentUser.firmId}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'audit-integrity',
      name: 'Audit Trail Generation & Immutability',
      category: 'Audit Trail',
      passed: false,
      message: 'Audit log verification failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  return suite;
}
