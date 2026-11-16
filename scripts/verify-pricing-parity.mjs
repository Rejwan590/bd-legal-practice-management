import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PRICING_PATHS = [
  path.join(rootDir, 'src', 'utils', 'pricing.ts'),
  path.join(rootDir, 'admin-app', 'src', 'utils', 'pricing.ts'),
  path.join(rootDir, 'server-cloudflare', 'src', 'utils', 'pricing.ts'),
];

console.log('[pricing-parity] Checking source file parity...');

// 1. Verify existence and byte/hash parity
const hashes = [];
for (const p of PRICING_PATHS) {
  if (!fs.existsSync(p)) {
    console.error(`[pricing-parity] Missing file: ${p}`);
    process.exit(1);
  }
  const content = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  hashes.push({ path: p, hash, content });
}

const firstHash = hashes[0].hash;
for (let i = 1; i < hashes.length; i++) {
  if (hashes[i].hash !== firstHash) {
    console.error(`[pricing-parity] Hash mismatch between ${hashes[0].path} and ${hashes[i].path}`);
    process.exit(1);
  }
}
console.log(`[pricing-parity] Source code is 100% identical across all 3 locations (SHA256: ${firstHash.slice(0, 12)}...)`);

// 2. Behavioral verification using sample test vectors
const TEST_VECTORS = [
  {
    name: 'Solo Plan Default',
    plan: { priceBdt: 599, includedUsers: 2, includedDevices: 2, extraUserPriceBdt: 100, extraDevicePriceBdt: 100 },
    firm: { maxUsers: 2, maxDevices: 2, billingCycle: 'monthly' },
    expectedMonthly: 599,
    expectedAnnual: 5990,
  },
  {
    name: 'Chamber Plan with Extra Users & Devices',
    plan: { priceBdt: 1299, includedUsers: 5, includedDevices: 5, extraUserPriceBdt: 100, extraDevicePriceBdt: 100 },
    firm: { maxUsers: 8, maxDevices: 7, billingCycle: 'monthly' },
    // 1299 + (3 * 100) + (2 * 100) = 1799
    expectedMonthly: 1799,
    expectedAnnual: 17990,
  },
  {
    name: 'Professional Plan with Custom Overrides',
    plan: { priceBdt: 2499, includedUsers: 12, includedDevices: 10, extraUserPriceBdt: 100, extraDevicePriceBdt: 100 },
    firm: {
      maxUsers: 15,
      maxDevices: 12,
      customBasePriceBdt: 2000,
      customExtraUserPriceBdt: 80,
      customAnnualPriceBdt: 22000,
      billingCycle: 'annual',
    },
    // base: 2000, extra users: 3 * 80 = 240, extra devices: 2 * 100 = 200 => monthly = 2440
    expectedMonthly: 2440,
    expectedAnnual: 22000,
  },
  {
    name: 'Null/Undefined Firm Input (Defaults applied)',
    plan: { priceBdt: 599, includedUsers: 2, includedDevices: 2, extraUserPriceBdt: 100, extraDevicePriceBdt: 100 },
    firm: null,
    expectedMonthly: 599,
    expectedAnnual: 5990,
  },
];

async function run() {
  for (const item of hashes) {
    const fileUrl = pathToFileURL(item.path).href;
    const mod = await import(fileUrl);
    for (const vec of TEST_VECTORS) {
      const res = mod.calculatePricing(vec.plan, vec.firm);
      if (res.monthlyTotal !== vec.expectedMonthly) {
        console.error(`[pricing-parity] FAIL on ${path.basename(path.dirname(item.path))} vector "${vec.name}": monthlyTotal ${res.monthlyTotal} != expected ${vec.expectedMonthly}`);
        process.exit(1);
      }
      if (res.annualTotal !== vec.expectedAnnual) {
        console.error(`[pricing-parity] FAIL on ${path.basename(path.dirname(item.path))} vector "${vec.name}": annualTotal ${res.annualTotal} != expected ${vec.expectedAnnual}`);
        process.exit(1);
      }
    }
  }

  for (const vec of TEST_VECTORS) {
    console.log(`[pricing-parity] PASS: ${vec.name} (monthly: ${vec.expectedMonthly}, annual: ${vec.expectedAnnual})`);
  }

  console.log('[pricing-parity] All pricing parity checks passed across all 3 modules!');
}

run().catch((err) => {
  console.error('[pricing-parity] Error executing verification:', err);
  process.exit(1);
});
