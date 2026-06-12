'use strict';

const fs = require('fs');
const path = require('path');

/**
 * depgraph-viz — Visualize npm dependency graphs as ASCII trees or SVG.
 * Zero dependencies.
 */

// ── Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a package.json and its lockfile to build a dependency tree.
 */
function parsePackage(rootDir) {
  const pkgPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`No package.json found in ${rootDir}`);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const lockPath = path.join(rootDir, 'package-lock.json');
  const yarnPath = path.join(rootDir, 'yarn.lock');

  let tree = {
    name: pkg.name || path.basename(rootDir),
    version: pkg.version || '0.0.0',
    dependencies: [],
    devDependencies: [],
    type: 'root'
  };

  const deps = pkg.dependencies || {};
  const devDeps = pkg.devDependencies || {};

  // Try lockfile for resolved versions and nested deps
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    tree.dependencies = buildFromNpmLock(deps, lock, 'prod');
    tree.devDependencies = buildFromNpmLock(devDeps, lock, 'dev');
  } else {
    // No lockfile — just list direct deps
    tree.dependencies = Object.entries(deps).map(([name, version]) => ({
      name, version: version, dependencies: [], type: 'prod'
    }));
    tree.devDependencies = Object.entries(devDeps).map(([name, version]) => ({
      name, version: version, dependencies: [], type: 'dev'
    }));
  }

  return { pkg, tree };
}

function buildFromNpmLock(deps, lock, type) {
  const result = [];
  const lockDeps = lock.dependencies || {};

  for (const [name, version] of Object.entries(deps)) {
    const node = { name, version, dependencies: [], type };

    // Resolved version from lockfile
    const lockEntry = lockDeps[name];
    if (lockEntry) {
      node.version = lockEntry.version || version;
      node.resolved = lockEntry.resolved || null;

      // Recurse one level into nested deps
      const nested = lockEntry.requires || {};
      node.dependencies = Object.entries(nested).map(([n, v]) => ({
        name: n, version: v, dependencies: [], type: 'nested'
      }));
    }

    result.push(node);
  }

  return result;
}

// ── ASCII Rendering ──────────────────────────────────────────────────────

function toAscii(tree, options = {}) {
  const { showDev = true, maxDepth = 4, color = false } = options;
  const lines = [];

  lines.push(`${tree.name}@${tree.version}`);

  const allDeps = [
    ...tree.dependencies.map(d => ({ ...d, type: 'prod' })),
    ...(showDev ? tree.devDependencies.map(d => ({ ...d, type: 'dev' })) : [])
  ];

  allDeps.forEach((dep, i) => {
    const isLast = i === allDeps.length - 1;
    const prefix = isLast ? '└── ' : '├── ';
    const typeTag = dep.type === 'dev' ? ' (dev)' : '';
    lines.push(`${prefix}${dep.name}@${dep.version}${typeTag}`);

    if (dep.dependencies && dep.dependencies.length > 0 && maxDepth > 1) {
      renderSubtree(dep.dependencies, lines, isLast ? '    ' : '│   ', 1, maxDepth);
    }
  });

  return lines.join('\n');
}

function renderSubtree(deps, lines, indent, depth, maxDepth) {
  if (depth >= maxDepth) {
    if (deps.length > 0) {
      lines.push(`${indent}└── ... (${deps.length} more)`);
    }
    return;
  }

  deps.forEach((dep, i) => {
    const isLast = i === deps.length - 1;
    const prefix = isLast ? '└── ' : '├── ';
    lines.push(`${indent}${prefix}${dep.name}@${dep.version}`);

    if (dep.dependencies && dep.dependencies.length > 0) {
      renderSubtree(dep.dependencies, lines, indent + (isLast ? '    ' : '│   '), depth + 1, maxDepth);
    }
  });
}

// ── SVG Rendering ────────────────────────────────────────────────────────

function toSvg(tree, options = {}) {
  const { showDev = true, width = 900, nodeHeight = 36 } = options;

  const nodes = [];
  const edges = [];

  // Layout — simple top-down tree
  let y = 40;
  const rootId = 'root';
  nodes.push({ id: rootId, label: `${tree.name}@${tree.version}`, x: width / 2, y, type: 'root' });
  y += 70;

  const allDeps = [
    ...tree.dependencies.map(d => ({ ...d, type: 'prod' })),
    ...(showDev ? tree.devDependencies.map(d => ({ ...d, type: 'dev' })) : [])
  ];

  const colWidth = Math.min(200, (width - 40) / Math.max(allDeps.length, 1));
  const startX = (width - colWidth * allDeps.length) / 2 + colWidth / 2;

  allDeps.forEach((dep, i) => {
    const depId = `dep-${i}`;
    const x = startX + i * colWidth;
    nodes.push({ id: depId, label: `${dep.name}@${dep.version}`, x, y, type: dep.type });
    edges.push({ from: rootId, to: depId });

    if (dep.dependencies && dep.dependencies.length > 0) {
      let subY = y + 70;
      const subWidth = Math.min(colWidth, colWidth);
      const subStartX = x - (dep.dependencies.length * subWidth) / 2 + subWidth / 2;

      dep.dependencies.forEach((sub, j) => {
        const subId = `sub-${i}-${j}`;
        nodes.push({ id: subId, label: `${sub.name}@${sub.version}`, x: subStartX + j * subWidth, y: subY, type: 'nested' });
        edges.push({ from: depId, to: subId });
      });
    }
  });

  // Build SVG
  const typeColors = {
    root: '#4f46e5',
    prod: '#059669',
    dev: '#d97706',
    nested: '#6b7280'
  };

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${y + 120}" width="${width}">
  <style>
    text { font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 12px; fill: #1f2937; }
    .node-rect { rx: 8; ry: 8; stroke-width: 2; }
    .edge { stroke: #d1d5db; stroke-width: 1.5; fill: none; }
    .label { text-anchor: middle; dominant-baseline: central; }
  </style>
`;

  // Edges
  edges.forEach(e => {
    const from = nodes.find(n => n.id === e.from);
    const to = nodes.find(n => n.id === e.to);
    if (from && to) {
      svg += `  <path class="edge" d="M${from.x},${from.y + 18} C${from.x},${from.y + 44} ${to.x},${to.y - 26} ${to.x},${to.y - 18}" />\n`;
    }
  });

  // Nodes
  nodes.forEach(n => {
    const color = typeColors[n.type] || '#6b7280';
    const textLen = n.label.length;
    const w = Math.max(100, textLen * 7.5 + 24);
    const h = nodeHeight;
    svg += `  <rect class="node-rect" x="${n.x - w/2}" y="${n.y - h/2}" width="${w}" height="${h}" fill="white" stroke="${color}" />\n`;
    svg += `  <text class="label" x="${n.x}" y="${n.y}">${escapeXml(n.label)}</text>\n`;
  });

  // Legend
  const legendY = y + 80;
  svg += `  <text x="20" y="${legendY}" font-size="11" fill="#6b7280">Legend:</text>\n`;
  let lx = 80;
  for (const [t, c] of Object.entries(typeColors)) {
    svg += `  <rect x="${lx}" y="${legendY - 8}" width="12" height="12" fill="white" stroke="${c}" rx="3" />\n`;
    svg += `  <text x="${lx + 18}" y="${legendY}" font-size="11" fill="#374151">${t}</text>\n`;
    lx += t.length * 7 + 40;
  }

  svg += `</svg>`;
  return svg;
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Stats ────────────────────────────────────────────────────────────────

function getStats(tree) {
  const prodCount = tree.dependencies.length;
  const devCount = tree.devDependencies.length;
  let nestedCount = 0;

  const countNested = (deps) => {
    deps.forEach(d => {
      if (d.dependencies) {
        nestedCount += d.dependencies.length;
        countNested(d.dependencies);
      }
    });
  };
  countNested(tree.dependencies);
  countNested(tree.devDependencies);

  const allVersions = {};
  const collectVersions = (deps) => {
    deps.forEach(d => {
      if (!allVersions[d.name]) allVersions[d.name] = new Set();
      allVersions[d.name].add(d.version);
      if (d.dependencies) collectVersions(d.dependencies);
    });
  };
  collectVersions(tree.dependencies);
  collectVersions(tree.devDependencies);

  const duplicates = Object.entries(allVersions)
    .filter(([, versions]) => versions.size > 1)
    .map(([name, versions]) => ({ name, versions: [...versions] }));

  return {
    name: tree.name,
    version: tree.version,
    prodDependencies: prodCount,
    devDependencies: devCount,
    nestedDependencies: nestedCount,
    total: prodCount + devCount + nestedCount,
    duplicates
  };
}

// ── Exports ──────────────────────────────────────────────────────────────

module.exports = { parsePackage, toAscii, toSvg, getStats };
