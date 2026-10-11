import { test, expect, Page } from '@playwright/test';

const MODULES = [
  { name: 'Dashboard', path: '/' },
  { name: 'Cases', path: '/cases' },
  { name: 'CaseDossier-Overview', path: '/cases/case-001/overview' },
  { name: 'CaseDossier-Hearings', path: '/cases/case-001/hearings' },
  { name: 'CaseDossier-Tasks', path: '/cases/case-001/tasks' },
  { name: 'CaseDossier-Files', path: '/cases/case-001/files' },
  { name: 'CaseDossier-Activity', path: '/cases/case-001/activity' },
  { name: 'Clients', path: '/clients' },
  { name: 'ClientProfile-Cases', path: '/clients/client-001' },
  { name: 'ClientProfile-Tasks', path: '/clients/client-001/tasks' },
  { name: 'ClientProfile-Files', path: '/clients/client-001/files' },
  { name: 'Hearings', path: '/hearings' },
  { name: 'Tasks', path: '/tasks' },
  { name: 'Files', path: '/files' },
  { name: 'Calendar', path: '/calendar' },
  { name: 'Search', path: '/search' },
  { name: 'Backup', path: '/backup' },
  { name: 'AuditLog', path: '/auditLog' },
  { name: 'Settings', path: '/settings' },
  { name: 'Health', path: '/health' },
];

const VIEWPORT_WIDTHS = [360, 768, 1280];

async function assertNoHorizontalOverflow(page: Page, contextName: string, width: number) {
  const scrollData = await page.evaluate(() => {
    const docScrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body ? document.body.scrollWidth : 0;
    const scrollWidth = Math.max(docScrollWidth, bodyScrollWidth);
    const innerWidth = window.innerWidth;
    return {
      scrollWidth,
      innerWidth,
      diff: scrollWidth - innerWidth,
      hasOverflow: scrollWidth > innerWidth,
    };
  });

  expect(
    scrollData.hasOverflow,
    `Horizontal scroll detected on ${contextName} at ${width}px viewport! scrollWidth (${scrollData.scrollWidth}px) > window.innerWidth (${scrollData.innerWidth}px) [diff: +${scrollData.diff}px]`
  ).toBe(false);
}

for (const width of VIEWPORT_WIDTHS) {
  test.describe(`Responsive No-Horizontal-Overflow Tests @ ${width}px`, () => {
    test.use({
      viewport: { width, height: 800 },
    });

    for (const mod of MODULES) {
      test(`Route: ${mod.name} (${mod.path}) has no horizontal scroll at ${width}px`, async ({ page }) => {
        await page.goto(mod.path, { waitUntil: 'networkidle' });
        await page.waitForTimeout(250);
        await assertNoHorizontalOverflow(page, mod.name, width);
      });
    }

    test(`Case Dossier Modals (Edit Case, Add Hearing, Add Task, Add File) have no horizontal scroll at ${width}px`, async ({
      page,
    }) => {
      // 1. Overview -> Edit Case Modal
      await page.goto('/cases/case-001/overview', { waitUntil: 'networkidle' });
      await page.waitForTimeout(200);
      await page.getByTestId('case-header-edit-btn').click();
      await page.waitForTimeout(150);
      await assertNoHorizontalOverflow(page, 'CaseEditModal', width);
      await page.keyboard.press('Escape');

      // 2. Hearings Tab -> Add Hearing Modal
      await page.getByTestId('dossier-tab-hearings').click();
      await page.waitForTimeout(150);
      await page.getByTestId('dossier-add-hearing-btn').click();
      await page.waitForTimeout(150);
      await assertNoHorizontalOverflow(page, 'AddHearingModal', width);
      await page.keyboard.press('Escape');

      // 3. Tasks Tab -> Add Task Modal
      await page.getByTestId('dossier-tab-tasks').click();
      await page.waitForTimeout(150);
      await page.getByTestId('dossier-add-task-btn').click();
      await page.waitForTimeout(150);
      await assertNoHorizontalOverflow(page, 'AddTaskModal', width);
      await page.keyboard.press('Escape');

      // 4. Files Tab -> Add File Modal
      await page.getByTestId('dossier-tab-files').click();
      await page.waitForTimeout(150);
      await page.getByTestId('dossier-add-file-btn').click();
      await page.waitForTimeout(150);
      await assertNoHorizontalOverflow(page, 'AddFileModal', width);
    });
  });
}

test.describe('Deep Link, Refresh Persistence & Browser Back Navigation', () => {
  test('Deep link opens right tab, refresh keeps place, and Back returns to previous tab', async ({
    page,
  }) => {
    await page.goto('/cases/case-001/hearings', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('dossier-panel-hearings')).toBeVisible();

    // Switch to Tasks tab -> URL updates to /cases/case-001/tasks
    await page.getByTestId('dossier-tab-tasks').click();
    await expect(page).toHaveURL(/\/cases\/case-001\/tasks$/);
    await expect(page.getByTestId('dossier-panel-tasks')).toBeVisible();

    // Refresh keeps the place on the Tasks tab
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/cases\/case-001\/tasks$/);
    await expect(page.getByTestId('dossier-panel-tasks')).toBeVisible();

    // Browser Back button returns to the Hearings tab
    await page.goBack();
    await expect(page).toHaveURL(/\/cases\/case-001\/hearings$/);
    await expect(page.getByTestId('dossier-panel-hearings')).toBeVisible();
  });
});
