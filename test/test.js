'use strict';

const fs = require('fs');
const path = require('path');
const { parsePackageLock, parseYarnLock, parsePnpmLock, buildTree, renderAscii, renderSvg, computeStats } = require('../src/index');

let pass = 0, fail = 0;

function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL: ${msg}`); }
}

function assertIncludes(haystack, needle, msg) {
  assert(haystack.includes(needle), msg || `Expected "${needle}" in output`);
}

// ── Test data ──

const samplePkgJson = {
  name: 'my-app',
  version: '1.0.0',
  dependencies: { lodash: '^4.17.0', express: '^4.18.0' },
  devDependencies: { jest: '^29.0.0' },
};

const sampleLock = {
  dependencies: {
    lodash: { version: '4.17.21', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz' },
    express: { version: '4.18.2', resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz', requires: { accepts: '~1.3.8', 'body-parser': '1.20.1' } },
    accepts: { version: '1.3.8', resolved: 'https://registry.npmjs.org/accepts/-/accepts-1.3.8.tgz', requires: { negotiator: '0.6.3' } },
    negotiator: { version: '0.6.3', resolved: 'https://registry.npmjs.org/negotiator/-/negotiator-0.6.3.tgz' },
    'body-parser': { version: '1.20.1', resolved: 'https://registry.npmjs.org/body-parser/-/body-parser-1.20.1.tgz' },
    jest: { version: '29.7.0', resolved: 'https://registry.npmjs.org/jest/-/jest-29.7.0.tgz', requires: {}, dev: true },
  },
};

// ── parsePackageLock ──

console.log('parsePackageLock');
{
  const deps = parsePackageLock(JSON.stringify(sampleLock));
  assert(deps.lodash.version === '4.17.21', 'lodash version');
  assert(deps.express.version === '4.18.2', 'express version');
  assert(deps.express.dependencies.includes('accepts'), 'express requires accepts');
  assert(deps.jest.dev === true, 'jest is dev');
}

// ── parseYarnLock ──

console.log('parseYarnLock');
{
  const yarn = `"lodash@^4.17.0":
  version "4.17.21"
  resolved "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz"

"express@^4.18.0":
  version "4.18.2"
  resolved "https://registry.npmjs.org/express/-/express-4.18.2.tgz"
  dependencies:
    accepts "~1.3.8"
    body-parser "1.20.1"
`;
  const deps = parseYarnLock(yarn);
  assert(deps.lodash.version === '4.17.21', 'yarn lodash version');
  assert(deps.express.version === '4.18.2', 'yarn express version');
  assert(deps.express.dependencies.includes('accepts'), 'yarn express requires accepts');
}

// ── buildTree ──

console.log('buildTree');
{
  const lockDeps = parsePackageLock(sampleLock);
  const tree = buildTree(samplePkgJson, lockDeps, { maxDepth: 5 });
  assert(tree.name === 'my-app', 'root name');
  assert(tree.children.length === 3, '3 direct deps');
  const lodash = tree.children.find(c => c.name === 'lodash');
  assert(lodash && lodash.version === '4.17.21', 'lodash in tree');
  const express = tree.children.find(c => c.name === 'express');
  assert(express && express.children.length === 2, 'express has 2 children');
}

// ── buildTree prodOnly ──

console.log('buildTree prodOnly');
{
  const lockDeps = parsePackageLock(sampleLock);
  const tree = buildTree(samplePkgJson, lockDeps, { prodOnly: true });
  assert(tree.children.length === 2, 'only 2 prod deps');
  assert(!tree.children.find(c => c.name === 'jest'), 'no jest');
}

// ── buildTree maxDepth ──

console.log('buildTree maxDepth');
{
  const lockDeps = parsePackageLock(sampleLock);
  const tree = buildTree(samplePkgJson, lockDeps, { maxDepth: 1 });
  const express = tree.children.find(c => c.name === 'express');
  // depth 1 means express children would be depth 2 — they should still appear
  // maxDepth 1 from root, root is depth 0, direct deps depth 1
  assert(tree.name === 'my-app', 'root exists at depth 0');
}

// ── renderAscii ──

console.log('renderAscii');
{
  const lockDeps = parsePackageLock(sampleLock);
  const tree = buildTree(samplePkgJson, lockDeps, { maxDepth: 5 });
  const ascii = renderAscii(tree, { showVersion: true, color: false });
  assertIncludes(ascii, 'my-app@1.0.0', 'root label');
  assertIncludes(ascii, 'lodash@4.17.21', 'lodash in tree');
  assertIncludes(ascii, '├──', 'tree branch');
  assertIncludes(ascii, '└──', 'tree leaf');
}

// ── renderAscii no version ──

console.log('renderAscii no version');
{
  const lockDeps = parsePackageLock(sampleLock);
  const tree = buildTree(samplePkgJson, lockDeps);
  const ascii = renderAscii(tree, { showVersion: false, color: false });
  assertIncludes(ascii, 'lodash', 'lodash present');
  assert(!ascii.includes('lodash@'), 'no version');
}

// ── renderSvg ──

console.log('renderSvg');
{
  const lockDeps = parsePackageLock(sampleLock);
  const tree = buildTree(samplePkgJson, lockDeps, { maxDepth: 2 });
  const svg = renderSvg(tree);
  assert(svg.startsWith('<svg'), 'starts with svg tag');
  assertIncludes(svg, '</svg>', 'closes svg');
  assertIncludes(svg, 'lodash', 'lodash in svg');
  assertIncludes(svg, '<rect', 'has rect elements');
  assertIncludes(svg, '<text', 'has text elements');
  assertIncludes(svg, '<path', 'has path elements for edges');
}

// ── computeStats ──

console.log('computeStats');
{
  const lockDeps = parsePackageLock(sampleLock);
  const tree = buildTree(samplePkgJson, lockDeps, { maxDepth: 10 });
  const stats = computeStats(tree);
  assert(stats.total > 0, 'has total');
  assert(stats.unique > 0, 'has unique');
  assert(stats.maxDepth > 0, 'has depth');
}

// ── Circular detection ──

console.log('circular detection');
{
  const circularLock = {
    dependencies: {
      a: { version: '1.0.0', requires: { b: '1.0.0' } },
      b: { version: '1.0.0', requires: { a: '1.0.0' } },
    },
  };
  const circularPkg = { name: 'circ-test', version: '1.0.0', dependencies: { a: '^1.0.0' } };
  const lockDeps = parsePackageLock(circularLock);
  const tree = buildTree(circularPkg, lockDeps, { maxDepth: 10 });
  const ascii = renderAscii(tree, { color: false });
  assertIncludes(ascii, '(circular)', 'marks circular');
}

// ── Missing deps ──

console.log('missing deps');
{
  const pkgJson = { name: 'miss-test', version: '1.0.0', dependencies: { nonexistent: '^1.0.0' } };
  const lockDeps = {};
  const tree = buildTree(pkgJson, lockDeps);
  const ascii = renderAscii(tree, { color: false });
  assertIncludes(ascii, '(missing)', 'marks missing');
}

// ── Empty project ──

console.log('empty project');
{
  const tree = buildTree({ name: 'empty', version: '1.0.0' }, {});
  assert(tree.children.length === 0, 'no children');
  const ascii = renderAscii(tree, { color: false });
  assertIncludes(ascii, 'empty@1.0.0', 'root label');
  const stats = computeStats(tree);
  assert(stats.total === 0, 'zero total');
}

// ── Results ──

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
