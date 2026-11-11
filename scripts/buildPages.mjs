import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const rootDistDir = path.join(rootDir, 'dist');
const adminDistDir = path.join(rootDir, 'admin-app', 'dist');
const targetAdminDir = path.join(rootDistDir, 'admin');

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit', cwd: rootDir });
}

function main() {
  run('npm run build');
  run('npm run build:admin');

  const adminIndexPath = path.join(adminDistDir, 'index.html');
  const adminAssetsDir = path.join(adminDistDir, 'assets');
  if (!fs.existsSync(adminIndexPath)) {
    throw new Error(`Expected Super Admin build output at ${adminIndexPath}`);
  }

  fs.rmSync(targetAdminDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(targetAdminDir, 'assets'), { recursive: true });
  fs.copyFileSync(adminIndexPath, path.join(targetAdminDir, 'index.html'));

  if (fs.existsSync(adminAssetsDir)) {
    fs.cpSync(adminAssetsDir, path.join(targetAdminDir, 'assets'), { recursive: true });
  }

  // SPA fallback for /admin/* subpaths and security headers for Cloudflare Pages.
  fs.writeFileSync(
    path.join(rootDistDir, '_redirects'),
    '/admin/* /admin/index.html 200\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(rootDistDir, '_headers'),
    [
      '/*',
      '  X-Frame-Options: DENY',
      '  X-Content-Type-Options: nosniff',
      '  Referrer-Policy: strict-origin-when-cross-origin',
      '',
    ].join('\n'),
    'utf8'
  );

  console.log(`\nAssembled unified Cloudflare Pages output in ${rootDistDir} (Chamber App at /, Super Admin at /admin/)`);
}

main();
