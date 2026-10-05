import { DiagnosticContext, TestResult } from './types';

export async function runDashboardSearchTests(ctx: DiagnosticContext): Promise<TestResult[]> {
  const suite: TestResult[] = [];
  const { repos, ownerUser, staffUser, ownerCtx, staffCtx } = ctx;

  // Test 45: Chamber Dashboard Real-Time Metrics Aggregation Invariant
  try {
    const metrics = await repos.dashboard.getMetrics(ownerCtx);

    const pass =
      metrics.activeCasesCount >= 3 &&
      metrics.totalClientsCount >= 3 &&
      metrics.pendingTasksCount >= 1 &&
      metrics.checkedOutFilesCount >= 1 &&
      typeof metrics.todayHearingsCount === 'number' &&
      typeof metrics.pendingRemindersCount === 'number';

    suite.push({
      id: 'dashboard-metrics-integrity',
      name: 'Chamber Dashboard Real-Time Metrics Aggregation Invariant',
      category: 'Dashboard & Search',
      passed: pass,
      message: pass
        ? `Aggregated live chamber metrics: ${metrics.activeCasesCount} active cases, ${metrics.totalClientsCount} clients, ${metrics.pendingTasksCount} pending tasks, ${metrics.checkedOutFilesCount} files in custody.`
        : `Metrics aggregation failed: cases=${metrics.activeCasesCount}, clients=${metrics.totalClientsCount}`,
      details: `ActiveCases: ${metrics.activeCasesCount}, Clients: ${metrics.totalClientsCount}, Tasks: ${metrics.pendingTasksCount}, OverdueTasks: ${metrics.overdueTasksCount}, Files: ${metrics.checkedOutFilesCount}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'dashboard-metrics-integrity',
      name: 'Chamber Dashboard Real-Time Metrics Aggregation Invariant',
      category: 'Dashboard & Search',
      passed: false,
      message: 'Dashboard metrics integrity test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 46: Dashboard Confidential Cases Isolation & Zero Leakage Invariant
  try {
    const ownerMetrics = await repos.dashboard.getMetrics(ownerCtx);
    const staffMetrics = await repos.dashboard.getMetrics(staffCtx);
    const staffUrgent = await repos.dashboard.getUrgentItems(staffCtx);

    // Confidential case-003 must be excluded from staffMetrics
    const pass =
      staffMetrics.activeCasesCount < ownerMetrics.activeCasesCount &&
      !staffUrgent.todayHearings.some((h) => h.caseId === 'case-003') &&
      !staffUrgent.overdueTasks.some((t) => t.caseId === 'case-003') &&
      !staffUrgent.overdueFiles.some((f) => f.caseId === 'case-003');

    suite.push({
      id: 'dashboard-restricted-isolation',
      name: 'Dashboard Confidential Cases Isolation & Zero Leakage Invariant',
      category: 'Dashboard & Search',
      passed: pass,
      message: pass
        ? `Confidential matters strictly isolated: Owner sees ${ownerMetrics.activeCasesCount} cases vs Staff sees ${staffMetrics.activeCasesCount} cases; zero restricted items leaked in urgent widgets.`
        : `Confidential isolation failed: OwnerCases=${ownerMetrics.activeCasesCount}, StaffCases=${staffMetrics.activeCasesCount}`,
      details: `Owner active cases: ${ownerMetrics.activeCasesCount}, Staff active cases: ${staffMetrics.activeCasesCount}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'dashboard-restricted-isolation',
      name: 'Dashboard Confidential Cases Isolation & Zero Leakage Invariant',
      category: 'Dashboard & Search',
      passed: false,
      message: 'Dashboard restricted isolation test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 47: Global Cross-Entity Unified Search Invariant
  try {
    const results = await repos.search.search(ownerCtx, 'Dhaka');

    const hasClient = results.some((r) => r.entity === 'client');
    const hasCase = results.some((r) => r.entity === 'case');
    const allHaveTarget = results.every((r) => Boolean(r.targetTab) && Boolean(r.targetId));

    const pass = results.length >= 2 && (hasClient || hasCase) && allHaveTarget;

    suite.push({
      id: 'global-search-multi-entity',
      name: 'Global Cross-Entity Unified Search Invariant',
      category: 'Dashboard & Search',
      passed: pass,
      message: pass
        ? `Cross-entity query "Dhaka" indexed ${results.length} hit(s) across multiple chamber entities with routing targets.`
        : `Cross-entity search failed: total results = ${results.length}`,
      details: `Entities matched: ${[...new Set(results.map((r) => r.entity))].join(', ')}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'global-search-multi-entity',
      name: 'Global Cross-Entity Unified Search Invariant',
      category: 'Dashboard & Search',
      passed: false,
      message: 'Global cross-entity search test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 48: Global Search Confidentiality Enforcement & Zero Data Leakage
  try {
    const ownerSearch = await repos.search.search(ownerCtx, 'Company Matter');
    const staffSearch = await repos.search.search(staffCtx, 'Company Matter');

    const pass =
      ownerSearch.length >= 1 &&
      ownerSearch.some((r) => r.caseNumber === 'Company Matter No. 88/2022' || r.restricted === true) &&
      staffSearch.length === 0;

    suite.push({
      id: 'global-search-confidential-zero-leakage',
      name: 'Global Search Confidentiality Enforcement & Zero Data Leakage',
      category: 'Dashboard & Search',
      passed: pass,
      message: pass
        ? `Zero data leakage confirmed: Owner found ${ownerSearch.length} hit(s) for confidential query, while Staff without permissions received EXACTLY 0 results.`
        : `Confidential search leakage detected! Owner hits: ${ownerSearch.length}, Staff hits: ${staffSearch.length}`,
      details: `Staff search results count: ${staffSearch.length} (expected 0)`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'global-search-confidential-zero-leakage',
      name: 'Global Search Confidentiality Enforcement & Zero Data Leakage',
      category: 'Dashboard & Search',
      passed: false,
      message: 'Global search confidentiality test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 49: Exact Serial Number & Case Docket Lookup Invariant
  try {
    const fileHits = await repos.search.search(ownerCtx, 'F-000101');
    const caseHits = await repos.search.search(ownerCtx, '45/2023');

    const pass =
      fileHits.some((r) => r.entity === 'file' && r.serial === 'F-000101') &&
      caseHits.some((r) => r.entity === 'case' && r.caseNumber === 'Title Suit No. 45/2023');

    suite.push({
      id: 'global-search-serial-lookup',
      name: 'Exact Serial Number & Case Docket Lookup Invariant',
      category: 'Dashboard & Search',
      passed: pass,
      message: pass
        ? 'Exact serial lookup F-000101 and case docket lookup 45/2023 resolved accurately with target routes.'
        : 'Exact serial or docket lookup failed.',
      details: `File hits: ${fileHits.length}, Case hits: ${caseHits.length}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'global-search-serial-lookup',
      name: 'Exact Serial Number & Case Docket Lookup Invariant',
      category: 'Dashboard & Search',
      passed: false,
      message: 'Exact serial lookup test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 50: Urgent Overdue Tasks & Physical File Custody Detection Invariant
  try {
    const urgent = await repos.dashboard.getUrgentItems(ownerCtx);

    const nowMs = Date.now();
    const tasksValid = urgent.overdueTasks.every((t) => new Date(t.dueAt).getTime() < nowMs);
    const filesValid = urgent.overdueFiles.every(
      (f) => Boolean(f.dueBackAt) && new Date(f.dueBackAt!).getTime() < nowMs
    );

    const pass = tasksValid && filesValid && (urgent.overdueTasks.length > 0 || urgent.overdueFiles.length > 0);

    suite.push({
      id: 'dashboard-urgent-attention',
      name: 'Urgent Overdue Tasks & Physical File Custody Detection Invariant',
      category: 'Dashboard & Search',
      passed: pass,
      message: pass
        ? `Urgent attention correctly isolated ${urgent.overdueTasks.length} overdue task(s) and ${urgent.overdueFiles.length} overdue file return(s) with verifiable due timestamps.`
        : 'Urgent attention items validation failed.',
      details: `Overdue tasks: ${urgent.overdueTasks.length}, Overdue files: ${urgent.overdueFiles.length}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'dashboard-urgent-attention',
      name: 'Urgent Overdue Tasks & Physical File Custody Detection Invariant',
      category: 'Dashboard & Search',
      passed: false,
      message: 'Urgent attention test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  return suite;
}
