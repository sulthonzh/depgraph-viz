#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parsePackage, toAscii, toSvg, getStats } = require('./index');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
depgraph-viz — Visualize npm dependency graphs

Usage:
  depgraph-viz [path]           Show ASCII tree (default)
  depgraph-viz [path] --svg     Generate SVG file
  depgraph-viz [path] --stats   Show dependency statistics
  depgraph-viz [path] --no-dev  Hide devDependencies

Options:
  --svg <file>    Output SVG to file (default: depgraph.svg)
  --stats         Print dependency statistics
  --no-dev        Exclude devDependencies
  --depth <n>     Max tree depth (default: 4)
  --help, -h      Show this help
`);
  process.exit(0);
}

const targetDir = args.find(a => !a.startsWith('--')) || '.';
const absDir = path.resolve(targetDir);
const showDev = !args.includes('--no-dev');
const svgIdx = args.indexOf('--svg');
const showStats = args.includes('--stats');
const depthIdx = args.indexOf('--depth');
const maxDepth = depthIdx !== -1 ? parseInt(args[depthIdx + 1], 10) || 4 : 4;

try {
  const { tree } = parsePackage(absDir);

  if (showStats) {
    const stats = getStats(tree);
    console.log(`\n  ${stats.name}@${stats.version}`);
    console.log(`  Production deps: ${stats.prodDependencies}`);
    console.log(`  Dev deps:        ${stats.devDependencies}`);
    console.log(`  Nested deps:     ${stats.nestedDependencies}`);
    console.log(`  Total:           ${stats.total}`);
    if (stats.duplicates.length > 0) {
      console.log(`\n  ⚠  Duplicate packages:`);
      stats.duplicates.forEach(d => {
        console.log(`     ${d.name}: ${d.versions.join(', ')}`);
      });
    }
    console.log();
  } else if (svgIdx !== -1) {
    const outFile = args[svgIdx + 1] || 'depgraph.svg';
    const svg = toSvg(tree, { showDev });
    fs.writeFileSync(outFile, svg);
    console.log(`SVG written to ${outFile}`);
  } else {
    console.log(toAscii(tree, { showDev, maxDepth }));
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
