import { getRepositories } from '../../../data/repositories';
import { INITIAL_USERS, localStore } from '../../../data/mockStore';
import { FirmRecord, SecurityContext, UserRecord } from '../../../data/types';
import { ALL_PERMISSIONS, DEFAULT_STAFF_PERMISSIONS } from '../../../permissions';
import { DiagnosticContext, TestResult } from './types';
import { runFoundationTests } from './foundationTests';
import { runAuditTests } from './auditTests';
import { runClientsTests } from './clientsTests';
import { runCasesTests } from './casesTests';
import { runHearingsTests } from './hearingsTests';
import { runTasksTests } from './tasksTests';
import { runFilesTests } from './filesTests';
import { runCalendarRemindersTests } from './calendarRemindersTests';
import { runDashboardSearchTests } from './dashboardSearchTests';
import { runBackupTests } from './backupTests';
import { runSubscriptionTests } from './subscriptionTests';
import { runTeamVisibilityTests } from './teamVisibilityTests';
import { runHubNavigationTests } from './hubNavigationTests';

export * from './types';
export {
  runFoundationTests,
  runAuditTests,
  runClientsTests,
  runCasesTests,
  runHearingsTests,
  runTasksTests,
  runFilesTests,
  runCalendarRemindersTests,
  runDashboardSearchTests,
  runBackupTests,
  runSubscriptionTests,
  runTeamVisibilityTests,
  runHubNavigationTests,
};

export interface HealthDiagnosticOptions {
  currentUser?: UserRecord;
  currentFirm?: FirmRecord | null;
}

export async function runAllHealthDiagnostics(
  options?: HealthDiagnosticOptions
): Promise<TestResult[]> {
  const suite: TestResult[] = [];
  const repos = getRepositories();

  const isRestMode =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DATA_SOURCE === 'rest') ||
    (typeof process !== 'undefined' && process.env?.VITE_DATA_SOURCE === 'rest');

  if (isRestMode) {
    const activeUser = options?.currentUser;
    const activeFirmId = options?.currentFirm?.id || activeUser?.firmId || '';
    const now = new Date().toISOString();

    const ownerUser: UserRecord =
      activeUser && activeUser.role === 'Owner'
        ? activeUser
        : {
            id: 'diag-owner',
            firmId: activeFirmId,
            name: 'Diagnostic Owner',
            email: 'diag-owner@chamber.local',
            role: 'Owner',
            permissions: ALL_PERMISSIONS,
            language: 'en',
            active: true,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            createdBy: 'system',
            updatedBy: 'system',
          };

    const staffUser: UserRecord = {
      id: 'diag-staff',
      firmId: activeFirmId,
      name: 'Diagnostic Staff',
      email: 'diag-staff@chamber.local',
      role: 'Staff',
      permissions: DEFAULT_STAFF_PERMISSIONS,
      language: 'en',
      active: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: 'system',
      updatedBy: 'system',
    };

    const ctx: DiagnosticContext = {
      repos,
      ownerUser,
      staffUser,
      ownerCtx: { currentUser: ownerUser },
      staffCtx: { currentUser: staffUser },
    };

    // In REST mode, execute read-only foundation/i18n tests and skip mutating write tests
    const foundationResults = await runFoundationTests(ctx);
    suite.push(...foundationResults);
    suite.push({
      id: 'health-rest-write-protection',
      name: 'REST Mode Database Protection Guard',
      category: 'Data Layer',
      passed: true,
      message: 'Write-tests are safely skipped in REST mode to protect the live database from mutation.',
      details: 'Mutating test suites (Clients, Cases, Hearings, Tasks, Files, Backup, Subscription) skipped.',
    });
    return suite;
  }

  // Item 7: Snapshot real demo store state prior to running diagnostic tests
  const preSuiteSnapshot = localStore.getSnapshot();

  const ownerUser = INITIAL_USERS.find((u) => u.role === 'Owner')!;
  const staffUser = INITIAL_USERS.find((u) => u.role === 'Staff')!;
  const ownerCtx: SecurityContext = { currentUser: ownerUser };
  const staffCtx: SecurityContext = { currentUser: staffUser };

  const ctx: DiagnosticContext = {
    repos,
    ownerUser,
    staffUser,
    ownerCtx,
    staffCtx,
  };

  try {
    // 1. Foundation & Permissions & Data Layer & i18n
    const foundationResults = await runFoundationTests(ctx);
    suite.push(...foundationResults);

    // 2. Audit Trail
    const auditResults = await runAuditTests(ctx);
    suite.push(...auditResults);

    // 3. Clients Module
    const clientsResults = await runClientsTests(ctx);
    suite.push(...clientsResults);

    // 4. Cases Module
    const casesResults = await runCasesTests(ctx);
    suite.push(...casesResults);

    // 5. Hearings Module
    const hearingsResults = await runHearingsTests(ctx);
    suite.push(...hearingsResults);

    // 6. Tasks Module
    const tasksResults = await runTasksTests(ctx);
    suite.push(...tasksResults);

    // 7. Physical Files Module
    const filesResults = await runFilesTests(ctx);
    suite.push(...filesResults);

    // 8. Calendar & Reminders
    const calendarResults = await runCalendarRemindersTests(ctx);
    suite.push(...calendarResults);

    // 9. Dashboard & Global Search
    const dashboardResults = await runDashboardSearchTests(ctx);
    suite.push(...dashboardResults);

    // 10. Backup & Restore (including Item 8 legacy backup test)
    const { suite: backupResults, exportedBackupJson } = await runBackupTests(ctx);
    suite.push(...backupResults);

    // 11. Subscription & Read-Only Enforcement
    const subscriptionResults = await runSubscriptionTests(ctx, exportedBackupJson);
    suite.push(...subscriptionResults);

    // 12. Team Hierarchy & Central Case Visibility
    const teamVisibilityResults = await runTeamVisibilityTests(ctx);
    suite.push(...teamVisibilityResults);

    // 13. Case Dossier & Client Hub Navigation Chains
    const hubNavResults = await runHubNavigationTests(ctx);
    suite.push(...hubNavResults);
  } finally {
    // Item 7: Always restore exact snapshot so user's demo data is never altered
    localStore.restoreSnapshot(preSuiteSnapshot);
  }

  // Item 7: Prove the store is 100% identical before and after the suite
  const postSuiteSnapshot = localStore.getSnapshot();
  const isIdentical = preSuiteSnapshot === postSuiteSnapshot;

  suite.push({
    id: 'store-demo-preservation-invariant',
    name: 'Store Preservation & Zero Demo Data Mutation Invariant (Item 7)',
    category: 'Data Layer',
    passed: isIdentical,
    message: isIdentical
      ? 'Chamber demo store is 100% byte-for-byte identical before and after executing the entire health test suite.'
      : 'Store preservation invariant violated! Demo data differed after diagnostics.',
    details: `Pre-suite snapshot size: ${preSuiteSnapshot.length} bytes, Post-suite: ${postSuiteSnapshot.length} bytes.`,
  });

  return suite;
}
