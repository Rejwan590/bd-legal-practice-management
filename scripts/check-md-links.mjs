import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

function getMdFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === 'dist' || file === '.turbo') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getMdFiles(fullPath));
    } else if (file.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

const mdFiles = getMdFiles(rootDir);
const brokenLinks = [];

for (const file of mdFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    let rawTarget = match[2].trim();
    if (rawTarget.startsWith('http://') || rawTarget.startsWith('https://') || rawTarget.startsWith('mailto:') || rawTarget.startsWith('#')) {
      continue;
    }
    if (rawTarget.startsWith('file:///')) {
      rawTarget = rawTarget.replace(/^file:\/\/\//, '');
      if (rawTarget.startsWith('./')) {
        rawTarget = rawTarget.slice(2);
      }
    }
    const cleanTarget = rawTarget.split('#')[0];
    if (!cleanTarget) continue;

    const relToFile = path.resolve(path.dirname(file), cleanTarget);
    const relToRoot = path.resolve(rootDir, cleanTarget);

    if (!fs.existsSync(relToFile) && !fs.existsSync(relToRoot)) {
      brokenLinks.push({
        sourceFile: path.relative(rootDir, file).replace(/\\/g, '/'),
        linkText: match[1],
        target: match[2],
        resolvedPath: path.relative(rootDir, relToFile).replace(/\\/g, '/')
      });
    }
  }
}

console.log(`Scanned ${mdFiles.length} markdown files.`);
if (brokenLinks.length === 0) {
  console.log('✅ ZERO broken relative markdown links across all .md files in the repository!');
  process.exit(0);
} else {
  console.error('❌ Broken links found:', JSON.stringify(brokenLinks, null, 2));
  process.exit(1);
}
