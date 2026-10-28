import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('--- STARTING REST MODE SECURITY & BUNDLE SANITIZATION TEST SUITE ---');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, details?: string) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${details ? '- ' + details : ''}`);
      failed++;
    }
  }

  // 1. Source verification: UserSwitchModal.tsx enforces REST profile view without user list
  const userSwitchModalSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/modules/foundation/UserSwitchModal.tsx'),
    'utf8'
  );

  assert(
    userSwitchModalSrc.includes('!showDemoSwitcher') &&
    userSwitchModalSrc.includes("t('auth.myProfile'"),
    'UserSwitchModal defines dedicated REST "My Profile" view'
  );

  assert(
    !userSwitchModalSrc.includes('17 permissions'),
    'UserSwitchModal contains no hardcoded "17 permissions" string'
  );

  assert(
    userSwitchModalSrc.includes('showDemoSwitcher = !isRestMode && isDemoLoginEnabled'),
    'REST mode strictly gates demo switcher behind !isRestMode'
  );

  // 2. Source verification: AuthContext in REST mode never uses INITIAL_USERS or mock users
  const authContextSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/modules/foundation/AuthContext.tsx'),
    'utf8'
  );

  assert(
    authContextSrc.includes('isRestMode ? emptyUser : INITIAL_USERS[0]'),
    'AuthContext initializes emptyUser in REST mode'
  );

  assert(
    authContextSrc.includes('isRestMode ? [] : INITIAL_USERS'),
    'AuthContext initializes empty usersList in REST mode'
  );

  assert(
    authContextSrc.includes('if (isRestMode) return;'),
    'switchUser is a strict no-op in REST mode (no USER_SWITCH audit logged)'
  );

  // 3. Built Production Bundle Verification (Grep the bundle)
  const distAssetsDir = path.resolve(__dirname, '../dist/assets');
  if (fs.existsSync(distAssetsDir)) {
    const jsFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
    assert(jsFiles.length > 0, 'Production bundle JS chunks exist in dist/assets');

    let totalBundleContent = '';
    for (const file of jsFiles) {
      totalBundleContent += fs.readFileSync(path.join(distAssetsDir, file), 'utf8');
    }

    assert(
      !totalBundleContent.includes('owner@firm.bd'),
      'Production REST build does not contain owner@firm.bd'
    );

    assert(
      !totalBundleContent.includes('staff@firm.bd'),
      'Production REST build does not contain staff@firm.bd'
    );

    assert(
      !totalBundleContent.includes('OwnerPassword123!'),
      'Production REST build does not contain OwnerPassword123!'
    );

    assert(
      !totalBundleContent.includes('StaffPassword123!'),
      'Production REST build does not contain StaffPassword123!'
    );
  } else {
    console.warn('[WARN] dist/assets directory not found, run npm run build first.');
  }

  console.log(`\n========================================`);
  console.log(`REST MODE SECURITY TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
