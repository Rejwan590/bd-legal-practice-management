import { test, expect } from '@playwright/test';

const MODULES = [
  { name: 'Dashboard', hash: '#dashboard' },
  { name: 'Cases', hash: '#cases' },
  { name: 'Clients', hash: '#clients' },
  { name: 'Hearings', hash: '#hearings' },
  { name: 'Tasks', hash: '#tasks' },
  { name: 'Files', hash: '#files' },
  { name: 'Calendar', hash: '#calendar' },
  { name: 'Backup', hash: '#backup' },
  { name: 'AuditLog', hash: '#auditLog' },
  { name: 'Settings', hash: '#settings' },
  { name: 'Health', hash: '#health' },
];

const VIEWPORT_WIDTHS = [360, 768, 1280];

for (const width of VIEWPORT_WIDTHS) {
  test.describe(`Responsive No-Horizontal-Overflow Tests @ ${width}px`, () => {
    test.use({
      viewport: { width, height: 800 },
    });

    for (const mod of MODULES) {
      test(`Module: ${mod.name} has no horizontal scroll at ${width}px`, async ({ page }) => {
        await page.goto(`/${mod.hash}`, { waitUntil: 'networkidle' });
        // Give client components a moment to settle animations/layout
        await page.waitForTimeout(300);

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
          `Horizontal scroll detected on ${mod.name} at ${width}px viewport! scrollWidth (${scrollData.scrollWidth}px) > window.innerWidth (${scrollData.innerWidth}px) [diff: +${scrollData.diff}px]`
        ).toBe(false);
      });
    }
  });
}
