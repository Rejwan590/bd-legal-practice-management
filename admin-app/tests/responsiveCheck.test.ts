import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

// Simple static server for admin-app/dist
function startStaticServer(port = 4174): Promise<http.Server> {
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url!.split('?')[0]);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading file');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function runResponsiveCheck() {
  console.log('\n========================================');
  console.log('STARTING ADMIN APP 360PX RESPONSIVE CHECK');
  console.log('========================================\n');

  if (!fs.existsSync(distDir)) {
    console.error('Dist directory does not exist. Run "npm run build --prefix admin-app" first.');
    process.exit(1);
  }

  const port = 4174;
  const server = await startStaticServer(port);

  let browser;
  try {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
    const context = await browser.newContext({
      viewport: { width: 360, height: 640 },
    });
    const page = await context.newPage();

    // Mock API requests for standalone screen testing
    await page.route('**/api/admin/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          admin: { id: 'admin-001', email: 'superadmin@platform.bd', active: true },
        }),
      });
    });

    await page.route('**/api/admin/firms*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          firms: [
            {
              id: 'firm-001',
              firmId: 'firm-001',
              name: 'Rahman & Associates Chambers Supreme Court Bar Association',
              contact: '+880 1711-000000',
              officeAddress: 'Supreme Court Bar Association Building, Ramna, Dhaka',
              maxDevices: 5,
              licenseExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
              status: 'active',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              deletedAt: null,
            },
          ],
          total: 1,
          page: 1,
          limit: 15,
          totalPages: 1,
        }),
      });
    });

    await page.route('**/api/admin/audit*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          logs: [
            {
              id: 'audit-001',
              adminId: 'admin-001',
              action: 'FIRM_CREATE',
              targetFirmId: 'firm-001',
              old: null,
              new: { name: 'Rahman & Associates' },
              ip: '127.0.0.1',
              at: new Date().toISOString(),
            },
          ],
          limit: 50,
          offset: 0,
        }),
      });
    });

    // 1. Check Authenticated Firm List Screen at 360px
    await page.goto(`http://127.0.0.1:${port}`);
    await page.waitForLoadState('networkidle');

    const viewportWidth = await page.evaluate(() => window.innerWidth);
    check(viewportWidth === 360, 'Browser viewport set to exactly 360px');

    const hasHorizontalScrollFirms = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > window.innerWidth;
    });
    check(!hasHorizontalScrollFirms, 'Firm list screen renders at 360px with zero horizontal scroll');

    // 2. Check Create Firm Modal at 360px
    const createBtn = page.locator('button:has-text("Create Chamber Firm")');
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(300);

      const modalHorizontalScroll = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > window.innerWidth;
      });
      check(!modalHorizontalScroll, 'Create Firm Modal renders at 360px with zero horizontal scroll');

      // Close modal
      const closeBtn = page.locator('button[aria-label="Close"]');
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // 3. Check Audit Trail Screen at 360px
    const auditTabBtn = page.locator('button:has-text("Platform Audit Log")');
    if (await auditTabBtn.first().isVisible()) {
      await auditTabBtn.first().click();
      await page.waitForTimeout(300);

      const auditHorizontalScroll = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > window.innerWidth;
      });
      check(!auditHorizontalScroll, 'Audit Trail screen renders at 360px with zero horizontal scroll');
    }

    // 4. Check Login Screen at 360px (unauthenticated)
    await page.unroute('**/api/admin/auth/me');
    await page.route('**/api/admin/auth/me', async (route) => {
      await route.fulfill({ status: 401, body: JSON.stringify({ error: 'Unauthorized' }) });
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    const loginHorizontalScroll = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > window.innerWidth;
    });
    check(!loginHorizontalScroll, 'Login screen renders at 360px with zero horizontal scroll');

    const loginEmailInput = page.locator('input[type="email"]');
    check(await loginEmailInput.isVisible(), 'Login screen form inputs rendered at 360px');

  } finally {
    if (browser) await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n========================================');
  console.log(`ADMIN APP 360PX CHECK: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runResponsiveCheck().catch((err) => {
  console.error('Fatal error in responsive check:', err);
  process.exit(1);
});
