#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseLockfile, buildTree, renderAscii, renderSvg, computeStats } = require('./index');

function findUp(name, dir) {
  let current = dir || process.cwd();
  for (let i = 0; i < 20; i++) {
    const fp = path.join(current, name);
    if (fs.existsSync(fp)) return fp;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const opts = { format: 'ascii', showVersion: true, prodOnly: false, color: true, maxDepth: 10, stats: false };

  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--svg') opts.format = 'svg';
    else if (a === '--ascii') opts.format = 'ascii';
    else if (a === '--no-version') opts.showVersion = false;
    else if (a === '--prod') opts.prodOnly = true;
    else if (a === '--no-color') opts.color = false;
    else if (a === '--stats') opts.stats = true;
    else if (a === '--max-depth' && args[i + 1]) { opts.maxDepth = parseInt(args[i + 1], 10); i++; }
    else if (a === '-o' && args[i + 1]) { opts.output = args[i + 1]; i++; }
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else if (a === '--version') { const pkg = require('../package.json'); console.log(pkg.version); process.exit(0); }
    else positional.push(a);
  }

  const dir = positional[0] || process.cwd();

  // Find lockfile
  const lockfiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
  let lockPath = null;
  for (const lf of lockfiles) {
    const found = findUp(lf, dir);
    if (found) { lockPath = found; break; }
  }
  if (!lockPath) {
    console.error('Error: No lockfile found (package-lock.json, yarn.lock, or pnpm-lock.yaml)');
    process.exit(1);
  }

  // Find package.json
  const pkgPath = findUp('package.json', path.dirname(lockPath));
  if (!pkgPath) {
    console.error('Error: No package.json found');
    process.exit(1);
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const lockDeps = parseLockfile(lockPath);
  const tree = buildTree(pkgJson, lockDeps, { maxDepth: opts.maxDepth, prodOnly: opts.prodOnly });

  if (opts.stats) {
    const stats = computeStats(tree);
    console.log(`Dependencies: ${stats.total} total, ${stats.unique} unique`);
    console.log(`Max depth: ${stats.maxDepth}`);
    if (stats.circular) console.log(`Circular: ${stats.circular}`);
    if (stats.missing) console.log(`Missing: ${stats.missing}`);
    if (stats.devCount) console.log(`Dev: ${stats.devCount}`);
    if (!opts.format) return;
    console.log('');
  }

  let output;
  if (opts.format === 'svg') {
    output = renderSvg(tree, { showVersion: opts.showVersion });
  } else {
    output = renderAscii(tree, { showVersion: opts.showVersion, color: opts.color });
  }

  if (opts.output) {
    fs.writeFileSync(opts.output, output, 'utf8');
    console.log(`Written to ${opts.output}`);
  } else {
    console.log(output);
  }
}

function printHelp() {
  console.log(`depgraph-viz — Visualize dependency graphs from lockfiles

Usage:
  depgraph-viz [dir] [options]

Options:
  --ascii          ASCII tree output (default)
  --svg            SVG output
  --no-version     Hide version numbers
  --prod           Production dependencies only
  --no-color       Disable colors in ASCII output
  --stats          Print dependency statistics
  --max-depth <n>  Max tree depth (default: 10)
  -o <file>        Write output to file
  -h, --help       Show help
  --version        Show version

Examples:
  depgraph-viz
  depgraph-viz ./my-project --svg -o deps.svg
  depgraph-viz --prod --stats
  depgraph-viz --max-depth 3 --no-color`);
}

main();
