import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function run(cmd, capture = false) {
  console.log(`\n> ${cmd}`);
  try {
    return execSync(cmd, {
      stdio: capture ? ['pipe', 'pipe', 'inherit'] : 'inherit',
      encoding: 'utf8',
      cwd: path.resolve('server-cloudflare'),
    });
  } catch (err) {
    if (!capture) throw err;
    console.error(err.message);
    return null;
  }
}

async function main() {
  console.log('====================================================');
  console.log('  BD LEGAL — AUTOMATED CLOUDFLARE PROVISION & DEPLOY ');
  console.log('====================================================');

  // 1. Check Authentication
  console.log('\n[1/6] Verifying Cloudflare authentication...');
  try {
    const whoami = run('npx wrangler whoami', true);
    if (!whoami || whoami.includes('not authenticated')) {
      console.error('\n❌ Error: Wrangler is not authenticated.');
      console.log('Please run: npx --prefix server-cloudflare wrangler login');
      process.exit(1);
    }
    console.log('✅ Authenticated to Cloudflare successfully!');
  } catch (err) {
    console.error('❌ Authentication check failed:', err.message);
    process.exit(1);
  }

  // 2. Create D1 Database (if not exists)
  console.log('\n[2/6] Provisioning D1 Database: bdlegal-d1-prod...');
  let databaseId = null;
  try {
    const d1Output = run('npx wrangler d1 create bdlegal-d1-prod', true);
    if (d1Output) {
      const match = d1Output.match(/database_id\s*=\s*"([a-f0-9-]+)"/i);
      if (match) {
        databaseId = match[1];
        console.log(`✅ Created D1 database! Database ID: ${databaseId}`);
      }
    }
  } catch {
    console.log('Notice: D1 database might already exist. Fetching database info...');
  }

  // If not extracted from create, inspect D1 list
  if (!databaseId) {
    try {
      const listOutput = run('npx wrangler d1 list --json', true);
      const list = JSON.parse(listOutput || '[]');
      const found = list.find((db) => db.name === 'bdlegal-d1-prod');
      if (found) {
        databaseId = found.uuid;
        console.log(`✅ Found existing D1 Database ID: ${databaseId}`);
      }
    } catch (err) {
      console.warn('Could not list D1 databases via JSON:', err.message);
    }
  }

  // 3. Update wrangler.toml with real database_id
  if (databaseId) {
    console.log('\n[3/6] Updating wrangler.toml with database ID...');
    const wranglerPath = path.resolve('server-cloudflare/wrangler.toml');
    let toml = fs.readFileSync(wranglerPath, 'utf8');
    toml = toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${databaseId}"`);
    fs.writeFileSync(wranglerPath, toml, 'utf8');
    console.log('✅ wrangler.toml updated.');
  }

  // 4. Create R2 Buckets
  console.log('\n[4/6] Provisioning R2 Buckets...');
  run('npx wrangler r2 bucket create bdlegal-photos || true');
  run('npx wrangler r2 bucket create bdlegal-backups || true');
  console.log('✅ R2 Buckets verified.');

  // 5. Apply Migrations to Remote D1
  console.log('\n[5/6] Applying 31 tables migrations to remote Cloudflare D1...');
  run('npx wrangler d1 migrations apply bdlegal-d1-prod --remote');
  console.log('✅ D1 migrations applied successfully.');

  // 6. Deploy Worker to Cloudflare
  console.log('\n[6/6] Deploying Cloudflare Worker to edge network...');
  run('npx wrangler deploy');
  console.log('\n🎉 ALL CLOUDFLARE RESOURCES PROVISIONED & DEPLOYED SUCCESSFULLY!');
}

main().catch((err) => {
  console.error('\n❌ Deployment failed:', err.message);
  process.exit(1);
});
