import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

function getDeepKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  let res: string[] = [];
  for (const k of Object.keys(obj)) {
    const val = obj[k];
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      res = res.concat(getDeepKeys(val as Record<string, unknown>, full));
    } else {
      res.push(full);
    }
  }
  return res;
}

function scanSourceFiles(dir: string): string[] {
  let files: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'locales') files = files.concat(scanSourceFiles(full));
    } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

async function runI18nParityTests() {
  console.log('--- STARTING I18N PARITY & MISSING KEYS SUITE ---');
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return Promise.resolve()
      .then(fn)
      .then(() => {
        console.log(`[PASS] ${name}`);
        passed++;
      })
      .catch((err) => {
        console.error(`[FAIL] ${name}:`, err.message);
        failed++;
      });
  }

  const enRaw = fs.readFileSync(path.resolve('src/locales/en.json'), 'utf8');
  const bnRaw = fs.readFileSync(path.resolve('src/locales/bn.json'), 'utf8');
  const enObj = JSON.parse(enRaw);
  const bnObj = JSON.parse(bnRaw);

  const enKeys = getDeepKeys(enObj);
  const bnKeys = getDeepKeys(bnObj);
  const enKeySet = new Set(enKeys);
  const bnKeySet = new Set(bnKeys);

  await test('Locale files have 100% key parity between en.json and bn.json', () => {
    const missingInBn = enKeys.filter((k) => !bnKeySet.has(k));
    const missingInEn = bnKeys.filter((k) => !enKeySet.has(k));
    assert.deepStrictEqual(missingInBn, [], `Keys present in en.json but missing in bn.json: ${missingInBn.join(', ')}`);
    assert.deepStrictEqual(missingInEn, [], `Keys present in bn.json but missing in en.json: ${missingInEn.join(', ')}`);
    assert.strictEqual(enKeys.length, bnKeys.length, 'Total key counts in en.json and bn.json must match');
  });

  await test('No empty translation strings in en.json and bn.json', () => {
    for (const key of enKeys) {
      const parts = key.split('.');
      let curEn: any = enObj;
      let curBn: any = bnObj;
      for (const p of parts) {
        curEn = curEn?.[p];
        curBn = curBn?.[p];
      }
      assert.ok(typeof curEn === 'string' && curEn.trim().length > 0, `Empty translation in en.json for ${key}`);
      assert.ok(typeof curBn === 'string' && curBn.trim().length > 0, `Empty translation in bn.json for ${key}`);
    }
  });

  await test('All static t(...) keys used in src exist in en.json', () => {
    const files = scanSourceFiles(path.resolve('src'));
    const missingFromSource: { key: string; file: string; line: number }[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const regex = /\bt\(\s*['`"]([^'`"\n]+)['`"]([\s,][^)]*)?\)/g;
        let match;
        while ((match = regex.exec(line)) !== null) {
          const key = match[1];
          if (key.includes('${')) continue;
          if (!enKeySet.has(key)) {
            missingFromSource.push({
              key,
              file: path.relative(process.cwd(), file),
              line: idx + 1,
            });
          }
        }
      });
    }

    assert.strictEqual(
      missingFromSource.length,
      0,
      `Found ${missingFromSource.length} missing translation keys in src: \n` +
        missingFromSource.map((m) => `  ${m.key} at ${m.file}:${m.line}`).join('\n')
    );
  });

  console.log(`\nI18n Parity Suite Complete: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runI18nParityTests();
