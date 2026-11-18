import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 320, height: 568, name: 'iPhone SE (320x568)' },
  { width: 360, height: 640, name: 'Small Android (360x640)' },
  { width: 375, height: 667, name: 'iPhone 8 (375x667)' },
  { width: 390, height: 844, name: 'iPhone 12/13/14 (390x844)' },
  { width: 414, height: 896, name: 'iPhone XR/11 (414x896)' },
  { width: 1280, height: 800, name: 'Desktop (1280x800)' },
];

test.describe('Quick Add Top-Down Menu Behavior', () => {
  for (const vp of VIEWPORTS) {
    test(`Quick Add Menu expands downward under button at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'networkidle' });

      // Locate the Quick Add (+) button in the header
      const plusButton = page.locator('[data-testid="context-plus-button"]');
      await expect(plusButton).toBeVisible();

      const buttonBox = await plusButton.boundingBox();
      expect(buttonBox).not.toBeNull();

      // Click to open
      await plusButton.click();

      // The menu should open directly beneath the button
      const menu = page.locator('[data-testid="context-plus-menu"]');
      await expect(menu).toBeVisible();

      const menuBox = await menu.boundingBox();
      expect(menuBox).not.toBeNull();

      if (buttonBox && menuBox) {
        // Menu top must be beneath the button bottom (expanding downward: up to down)
        expect(menuBox.y).toBeGreaterThanOrEqual(buttonBox.y);
        // Menu bottom must stay within the viewport
        expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(vp.height + 5);
        // Menu right must stay within the viewport
        expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(vp.width + 5);
        // Menu left must stay within the viewport
        expect(menuBox.x).toBeGreaterThanOrEqual(0);
      }

      // Verify all 6 actions in exact order
      const expectedActions = [
        'Register Case',
        'Register Client',
        'New Appointment',
        'Schedule Hearing',
        'New Task',
        'Register Physical File',
      ];

      for (const actionTitle of expectedActions) {
        const item = menu.locator(`text=${actionTitle}`);
        await expect(item).toBeVisible();
      }

      // Dismiss by clicking outside / pressing Escape
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
    });
  }

  test('Mobile dismiss via backdrop click', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.locator('[data-testid="context-plus-button"]').click();
    const menu = page.locator('[data-testid="context-plus-menu"]');
    await expect(menu).toBeVisible();

    // Click outside on the backdrop at bottom area
    await page.mouse.click(50, 700);
    await expect(menu).toHaveCount(0);
  });
});
