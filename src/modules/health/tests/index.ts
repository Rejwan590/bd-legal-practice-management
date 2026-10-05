import { getRepositories } from '../../../data/repositories';
import { INITIAL_USERS, localStore } from '../../../data/mockStore';
import { SecurityContext } from '../../../data/types';
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
};

export async function runAllHealthDiagnostics(): Promise<TestResult[]> {
  const suite: TestResult[] = [];

  // Item 7: Snapshot real demo store state prior to running diagnostic tests
  const preSuiteSnapshot = localStore.getSnapshot();

  const repos = getRepositories();
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
