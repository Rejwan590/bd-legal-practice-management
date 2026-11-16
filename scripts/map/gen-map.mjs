import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = process.cwd();

function walkDir(dir, filter = () => true) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === 'dist' || file === '.turbo' || file === 'playwright-report') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(walkDir(fullPath, filter));
    } else if (filter(file)) {
      results.push(fullPath);
    }
  }
  return results;
}

const codeFiles = walkDir(rootDir, (f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.mjs'));

// 1. Build Import Graph
const importGraph = new Map(); // file -> [importedFiles]
const reverseGraph = new Map(); // file -> [importerFiles]

for (const file of codeFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const relFile = path.relative(rootDir, file).replace(/\\/g, '/');
  const importedList = [];

  const importRegex = /(?:import|from)\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1] || match[2];
    let resolved = path.resolve(path.dirname(file), importPath);

    // If import ends in .js, check for corresponding .ts/.tsx
    if (resolved.endsWith('.js')) {
      const tsCandidate = resolved.replace(/\.js$/, '.ts');
      const tsxCandidate = resolved.replace(/\.js$/, '.tsx');
      if (fs.existsSync(tsCandidate)) resolved = tsCandidate;
      else if (fs.existsSync(tsxCandidate)) resolved = tsxCandidate;
    }

    if (fs.existsSync(resolved + '.ts')) resolved += '.ts';
    else if (fs.existsSync(resolved + '.tsx')) resolved += '.tsx';
    else if (fs.existsSync(resolved + '.js')) resolved += '.js';
    else if (fs.existsSync(resolved + '.mjs')) resolved += '.mjs';
    else if (fs.existsSync(path.join(resolved, 'index.ts'))) resolved = path.join(resolved, 'index.ts');
    else if (fs.existsSync(path.join(resolved, 'index.tsx'))) resolved = path.join(resolved, 'index.tsx');

    const relResolved = path.relative(rootDir, resolved).replace(/\\/g, '/');
    importedList.push(relResolved);

    if (!reverseGraph.has(relResolved)) {
      reverseGraph.set(relResolved, new Set());
    }
    reverseGraph.get(relResolved).add(relFile);
  }

  importGraph.set(relFile, importedList);
}

// 2. Identify Hotspots (>800 lines, >15 importers, 0 importers)
const fileStats = codeFiles.map(file => {
  const relFile = path.relative(rootDir, file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split('\n').length;
  const importers = reverseGraph.has(relFile) ? Array.from(reverseGraph.get(relFile)) : [];
  return { path: relFile, lines, importerCount: importers.length, importers };
});

const over800 = fileStats.filter(f => f.lines > 800).sort((a, b) => b.lines - a.lines);
const hubFiles = fileStats.filter(f => f.importerCount > 15).sort((a, b) => b.importerCount - a.importerCount);
const orphans = fileStats.filter(f => 
  f.importerCount === 0 && 
  !f.path.startsWith('tests/') && 
  !f.path.startsWith('e2e/') && 
  !f.path.endsWith('.test.ts') && 
  !f.path.endsWith('.spec.ts') && 
  !f.path.includes('index.html') && 
  !f.path.includes('main.tsx') && 
  !f.path.includes('server/src/index.ts') && 
  !f.path.includes('vite.config') && 
  !f.path.includes('scripts/')
);

// 3. Module-to-module analysis (src/modules)
const srcModulesDir = path.join(rootDir, 'src/modules');
const srcModuleNames = fs.existsSync(srcModulesDir) ? fs.readdirSync(srcModulesDir).filter(f => fs.statSync(path.join(srcModulesDir, f)).isDirectory()) : [];

const moduleGraph = new Map(); // module -> Set(targetModules)
const crossModuleSkipsRepo = [];

for (const mod of srcModuleNames) {
  moduleGraph.set(mod, new Set());
  const modFiles = walkDir(path.join(srcModulesDir, mod), f => f.endsWith('.ts') || f.endsWith('.tsx'));
  
  for (const f of modFiles) {
    const rel = path.relative(rootDir, f).replace(/\\/g, '/');
    const imports = importGraph.get(rel) || [];
    for (const imp of imports) {
      if (imp.startsWith('src/modules/')) {
        const parts = imp.split('/');
        const targetMod = parts[2];
        if (targetMod && targetMod !== mod) {
          moduleGraph.get(mod).add(targetMod);
          if (targetMod !== 'foundation' && !imp.includes('/types') && !imp.includes('/interfaces')) {
            crossModuleSkipsRepo.push({ source: rel, target: imp, sourceMod: mod, targetMod });
          }
        }
      }
    }
  }
}

// 4. Circular dependencies
const visited = new Set();
const recStack = new Set();
const cycles = [];

function findCycles(node, currentStack) {
  visited.add(node);
  recStack.add(node);
  currentStack.push(node);

  const neighbors = importGraph.get(node) || [];
  for (const neighbor of neighbors) {
    if (!importGraph.has(neighbor)) continue;
    if (!visited.has(neighbor)) {
      findCycles(neighbor, [...currentStack]);
    } else if (recStack.has(neighbor)) {
      const cycle = currentStack.slice(currentStack.indexOf(neighbor)).concat(neighbor);
      cycles.push(cycle);
    }
  }

  recStack.delete(node);
}

for (const [file] of importGraph) {
  if (!visited.has(file)) {
    findCycles(file, []);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log('=== GEN-MAP ANALYSIS COMPLETE ===');
  console.log(`Files over 800 lines: ${over800.length}`);
  console.log(`Hub files (>15 importers): ${hubFiles.length}`);
  console.log(`Orphan files: ${orphans.length}`);
  console.log(`Circular import cycles: ${cycles.length}`);
  console.log(`Cross-module direct coupling: ${crossModuleSkipsRepo.length}`);

  console.log('\n--- TOP 15 HUB FILES ---');
  hubFiles.slice(0, 15).forEach(h => console.log(`${h.importerCount} importers: ${h.path} (${h.lines} lines)`));

  console.log('\n--- FRONTEND MODULE-TO-MODULE CONNECTIONS ---');
  for (const [m, targets] of moduleGraph) {
    if (targets.size > 0) console.log(`${m} -> ${Array.from(targets).join(', ')}`);
  }

  console.log('\n--- SAMPLE ORPHAN FILES (0 IMPORTERS) ---');
  orphans.slice(0, 20).forEach(o => console.log(`${o.path} (${o.lines} lines)`));
}

export {
  fileStats,
  over800,
  hubFiles,
  orphans,
  moduleGraph,
  crossModuleSkipsRepo,
  cycles
};
