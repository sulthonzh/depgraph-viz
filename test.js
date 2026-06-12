'use strict';

const fs = require('fs');
const path = require('path');
const { parsePackage, toAscii, toSvg, getStats } = require('./index');

const tmp = path.join(__dirname, 'test-fixture');
let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.log(`  FAIL: ${msg}`); }
}

// Setup fixture
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
  name: 'test-app', version: '1.0.0',
  dependencies: { lodash: '^4.17.21', express: '^4.18.0' },
  devDependencies: { jest: '^29.0.0' }
}));
fs.writeFileSync(path.join(tmp, 'package-lock.json'), JSON.stringify({
  name: 'test-app', version: '1.0.0', lockfileVersion: 2,
  dependencies: {
    lodash: { version: '4.17.21', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz' },
    express: { version: '4.18.2', resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
      requires: { accepts: '~1.3.8', 'body-parser': '1.20.1', cookie: '0.5.0' }
    },
    jest: { version: '29.7.0', resolved: 'https://registry.npmjs.org/jest/-/jest-29.7.0.tgz' }
  }
}));

console.log('depgraph-viz tests\n');

// 1. Parse package
const { tree, pkg } = parsePackage(tmp);
assert(tree.name === 'test-app', 'root name');
assert(tree.version === '1.0.0', 'root version');
assert(tree.dependencies.length === 2, `prod deps count: ${tree.dependencies.length}`);
assert(tree.devDependencies.length === 1, `dev deps count: ${tree.devDependencies.length}`);

// 2. Lockfile resolved versions
const lodash = tree.dependencies.find(d => d.name === 'lodash');
assert(lodash && lodash.version === '4.17.21', `lodash version from lock: ${lodash?.version}`);
const express = tree.dependencies.find(d => d.name === 'express');
assert(express && express.version === '4.18.2', `express version from lock: ${express?.version}`);

// 3. Nested deps from lockfile
assert(express.dependencies.length === 3, `express nested deps: ${express.dependencies.length}`);
const hasAccepts = express.dependencies.some(d => d.name === 'accepts');
assert(hasAccepts, 'express has accepts nested dep');

// 4. ASCII output
const ascii = toAscii(tree, { showDev: true });
assert(ascii.includes('test-app@1.0.0'), 'ascii has root');
assert(ascii.includes('lodash@4.17.21'), 'ascii has lodash');
assert(ascii.includes('jest@29.7.0'), 'ascii has jest');
assert(ascii.includes('(dev)'), 'ascii marks dev deps');
assert(ascii.includes('├──') || ascii.includes('└──'), 'ascii has tree chars');

// 5. ASCII without dev
const asciiNoDev = toAscii(tree, { showDev: false });
assert(!asciiNoDev.includes('jest'), 'no-dev hides dev deps');
assert(!asciiNoDev.includes('(dev)'), 'no-dev has no dev tags');

// 6. ASCII depth limit — maxDepth=1 hides nested deps entirely
const asciiShallow = toAscii(tree, { maxDepth: 1, showDev: false });
assert(asciiShallow.includes('lodash@4.17.21'), 'depth 1 shows direct deps');
assert(asciiShallow.includes('express@4.18.2'), 'depth 1 shows express');
// With maxDepth=2, nested deps render but their children don't (not present in test data)
const asciiD2 = toAscii(tree, { maxDepth: 2, showDev: false });
assert(asciiD2.includes('accepts'), 'depth 2 shows nested deps');

// 7. SVG output
const svg = toSvg(tree, { showDev: true });
assert(svg.startsWith('<?xml'), 'svg starts with xml decl');
assert(svg.includes('<svg'), 'svg has svg element');
assert(svg.includes('lodash@4.17.21'), 'svg has lodash');
assert(svg.includes('test-app@1.0.0'), 'svg has root');
assert(svg.includes('legend', 'svg has legend') || svg.includes('Legend'), 'svg has legend');
assert(svg.includes('#059669'), 'svg has prod color');
assert(svg.includes('#d97706'), 'svg has dev color');

// 8. Stats
const stats = getStats(tree);
assert(stats.name === 'test-app', 'stats name');
assert(stats.prodDependencies === 2, `stats prod: ${stats.prodDependencies}`);
assert(stats.devDependencies === 1, `stats dev: ${stats.devDependencies}`);
assert(stats.nestedDependencies === 3, `stats nested: ${stats.nestedDependencies}`);
assert(stats.total === 6, `stats total: ${stats.total}`);

// 9. No lockfile fallback
const tmp2 = path.join(__dirname, 'test-fixture2');
fs.mkdirSync(tmp2, { recursive: true });
fs.writeFileSync(path.join(tmp2, 'package.json'), JSON.stringify({
  name: 'no-lock', version: '0.1.0',
  dependencies: { react: '^18.0.0' }
}));
const { tree: tree2 } = parsePackage(tmp2);
assert(tree2.dependencies.length === 1, 'no-lock prod deps');
assert(tree2.dependencies[0].version === '^18.0.0', 'no-lock version preserved');

// 10. Missing package.json
let threw = false;
try { parsePackage(path.join(__dirname, 'nonexistent')); } catch (e) { threw = true; }
assert(threw, 'throws on missing package.json');

// 11. Empty deps
const tmp3 = path.join(__dirname, 'test-fixture3');
fs.mkdirSync(tmp3, { recursive: true });
fs.writeFileSync(path.join(tmp3, 'package.json'), JSON.stringify({ name: 'empty', version: '0.0.0' }));
const { tree: tree3 } = parsePackage(tmp3);
assert(tree3.dependencies.length === 0, 'empty deps');
assert(tree3.devDependencies.length === 0, 'empty dev deps');
const ascii3 = toAscii(tree3);
assert(ascii3.includes('empty@0.0.0'), 'empty tree renders root');

// Cleanup
[tmp, tmp2, tmp3].forEach(d => fs.rmSync(d, { recursive: true, force: true }));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
