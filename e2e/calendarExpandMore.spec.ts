import { test, expect } from '@playwright/test';

test.describe('Calendar Month Grid - Expand "+N more" Hidden Matters & Date Key Bug', () => {
  for (const width of [768, 1024, 1280]) {
    test(`Month grid "+N more" expand/collapse and interactions at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/calendar');
      await page.waitForLoadState('networkidle');

      // Dates in November 2026:
      const d18 = '2026-11-18'; // exactly 3 matters
      const d6 = '2026-11-06';  // exactly 4 matters (+1 more)
      const d5 = '2026-11-05';  // 12 matters (+9 more)

      // 1. Day 18 (3 matters): has 3 badges, NO "+N more" button
      const expandBtn18 = page.locator(`[data-testid="calendar-expand-more-${d18}"]`);
      await expect(expandBtn18).toHaveCount(0);

      // 2. Day 6 (4 matters): has "+1 more" button with aria-expanded="false"
      const expandBtn6 = page.locator(`[data-testid="calendar-expand-more-${d6}"]`);
      await expect(expandBtn6).toBeVisible();
      await expect(expandBtn6).toHaveAttribute('aria-expanded', 'false');
      await expect(expandBtn6).toContainText('+1 more');

      // 3. Day 5 (12 matters): has "+9 more" button with aria-expanded="false"
      const expandBtn5 = page.locator(`[data-testid="calendar-expand-more-${d5}"]`);
      await expect(expandBtn5).toBeVisible();
      await expect(expandBtn5).toHaveAttribute('aria-expanded', 'false');
      await expect(expandBtn5).toContainText('+9 more');

      // 4. Click "+1 more" on Day 6
      await expandBtn6.click();

      // Day 6 is expanded: all 4 events visible, "+1 more" hidden, "Show less" visible
      await expect(expandBtn6).toHaveCount(0);
      const showLess6 = page.locator(`[data-testid="calendar-show-less-${d6}"]`);
      await expect(showLess6).toBeVisible();
      await expect(showLess6).toHaveAttribute('aria-expanded', 'true');

      // 5. Expand another date: Click "+9 more" on Day 5
      await expandBtn5.click();

      // Day 6 must now be COLLAPSED
      await expect(page.locator(`[data-testid="calendar-expand-more-${d6}"]`)).toBeVisible();
      await expect(showLess6).toHaveCount(0);

      // Day 5 must now be EXPANDED (all 12 events visible)
      const showLess5 = page.locator(`[data-testid="calendar-show-less-${d5}"]`);
      await expect(showLess5).toBeVisible();
      await expect(showLess5).toHaveAttribute('aria-expanded', 'true');
      await expect(expandBtn5).toHaveCount(0);

      // 6. Click "Show less" on Day 5: collapses Day 5
      await showLess5.click();
      await expect(page.locator(`[data-testid="calendar-expand-more-${d5}"]`)).toBeVisible();
      await expect(showLess5).toHaveCount(0);

      // 7. Test Filter Change Resets Expansion
      await page.locator(`[data-testid="calendar-expand-more-${d6}"]`).click();
      await expect(page.locator(`[data-testid="calendar-show-less-${d6}"]`)).toBeVisible();

      // Click "Court Hearings" filter button
      const hearingsFilterBtn = page.getByRole('button', { name: /Court Hearings/i });
      await hearingsFilterBtn.click();
      // Expanded state must be reset
      await expect(page.locator(`[data-testid="calendar-show-less-${d6}"]`)).toHaveCount(0);

      // Switch back to "All Items"
      const allFilterBtn = page.getByRole('button', { name: /All Items/i });
      await allFilterBtn.click();

      // 8. Test Month Navigation Resets Expansion
      await page.locator(`[data-testid="calendar-expand-more-${d6}"]`).click();
      await expect(page.locator(`[data-testid="calendar-show-less-${d6}"]`)).toBeVisible();

      // Click "Previous Month" button
      const prevMonthBtn = page.getByRole('button', { name: /Previous Month/i });
      await prevMonthBtn.click();
      await expect(page.locator(`[data-testid="calendar-show-less-${d6}"]`)).toHaveCount(0);

      // Return to Today
      const todayBtn = page.getByRole('button', { name: /Today/i });
      await todayBtn.click();

      // 9. Keyboard navigation: Tab to "+1 more" button and activate with Enter / Space
      const expandBtn6Kb = page.locator(`[data-testid="calendar-expand-more-${d6}"]`);
      await expandBtn6Kb.focus();
      await expect(expandBtn6Kb).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator(`[data-testid="calendar-show-less-${d6}"]`)).toBeVisible();

      // Collapse using Space key
      const showLess6Kb = page.locator(`[data-testid="calendar-show-less-${d6}"]`);
      await showLess6Kb.focus();
      await expect(showLess6Kb).toBeFocused();
      await page.keyboard.press('Space');
      await expect(page.locator(`[data-testid="calendar-expand-more-${d6}"]`)).toBeVisible();

      // 10. Click an expanded event badge and verify case dossier opens
      await page.locator(`[data-testid="calendar-expand-more-${d6}"]`).click();
      const firstEvent = page.locator(`[data-testid^="calendar-grid-event-"]`).first();
      await expect(firstEvent).toBeVisible();
      await firstEvent.click();

      // Should open dossier with tablist "Case dossier tabs"
      await expect(page.getByRole('tablist', { name: /Case dossier tabs/i })).toBeVisible();
    });
  }
});
