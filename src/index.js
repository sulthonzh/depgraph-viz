'use strict';

const fs = require('fs');
const path = require('path');

/**
 * depgraph-viz — Parse lockfiles and render dependency trees as ASCII or SVG.
 * Zero dependencies.
 */

// ── Lockfile Parsers ────────────────────────────────────────────────

function parsePackageLock(raw) {
  const lock = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const deps = {};

  for (const [name, info] of Object.entries(lock.dependencies || {})) {
    deps[name] = {
      version: info.version || '?',
      resolved: info.resolved || '',
      dependencies: Object.keys(info.requires || {}),
      dev: !!info.dev,
    };
  }
  return deps;
}

function parseYarnLock(raw) {
  const text = typeof raw === 'string' ? raw : String(raw);
  const deps = {};
  let current = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const headMatch = trimmed.match(/^"?(@?[^@]+)@"?([^"]*)"?:$/);
    if (headMatch) {
      const name = headMatch[1];
      current = { name, version: '?', resolved: '', dependencies: [], dev: false };
      if (!deps[name]) deps[name] = current;
      continue;
    }
    if (!current) continue;
    const vMatch = trimmed.match(/^version\s+"?([^"]+)"?/);
    if (vMatch) current.version = vMatch[1];
    const rMatch = trimmed.match(/^resolved\s+"?([^"]+)"?/);
    if (rMatch) current.resolved = rMatch[1];
    const dMatch = trimmed.match(/^dependencies:$/);
    if (dMatch) { /* flag next lines as deps */ }
    const depMatch = trimmed.match(/^(@?[^@]+)\s+"?[^"]*"?$/);
    if (depMatch && line.startsWith('    ') && !trimmed.startsWith('version') && !trimmed.startsWith('resolved') && !trimmed.startsWith('integrity') && !trimmed.startsWith('dependencies')) {
      current.dependencies.push(depMatch[1]);
    }
  }
  return deps;
}

function parsePnpmLock(raw) {
  const text = typeof raw === 'string' ? raw : String(raw);
  const deps = {};
  const lock = text;

  // Parse lockfileVersion >=6 format (YAML-ish)
  const packages = {};
  let currentPkg = null;
  let inDeps = false;

  for (const line of lock.split('\n')) {
    const pkgMatch = line.match(/^\s+('(?:@?[^']+)@(?:[^']+)'):/);
    if (pkgMatch) {
      const spec = pkgMatch[1].slice(1, -1);
      const atIdx = spec.indexOf('@', spec.startsWith('@') ? 1 : 0);
      const name = spec.substring(0, atIdx);
      const version = spec.substring(atIdx + 1);
      currentPkg = { name, version, dependencies: [], dev: false };
      packages[name] = currentPkg;
      inDeps = false;
      continue;
    }
    if (!currentPkg) continue;
    if (line.match(/^\s+dependencies:/)) { inDeps = true; continue; }
    if (inDeps) {
      const dMatch = line.match(/^\s+(@?[^:]+):/);
      if (dMatch) {
        currentPkg.dependencies.push(dMatch[1].trim());
      } else if (!line.match(/^\s\s\s\s/)) {
        inDeps = false;
      }
    }
  }

  for (const [name, info] of Object.entries(packages)) {
    deps[name] = { version: info.version, resolved: '', dependencies: info.dependencies, dev: false };
  }
  return deps;
}

/**
 * Detect lockfile type from filename
 */
function detectType(filename) {
  const base = path.basename(filename);
  if (base === 'package-lock.json') return 'npm';
  if (base === 'yarn.lock') return 'yarn';
  if (base === 'pnpm-lock.yaml') return 'pnpm';
  return null;
}

/**
 * Parse a lockfile (auto-detect format)
 */
function parseLockfile(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  const type = detectType(filepath);

  switch (type) {
    case 'npm': return parsePackageLock(raw);
    case 'yarn': return parseYarnLock(raw);
    case 'pnpm': return parsePnpmLock(raw);
    default:
      throw new Error(`Unsupported lockfile: ${path.basename(filepath)}. Use package-lock.json, yarn.lock, or pnpm-lock.yaml`);
  }
}

/**
 * Build a tree from package.json + lockfile deps
 */
function buildTree(pkgJson, lockDeps, options = {}) {
  const maxDepth = options.maxDepth || 10;
  const visited = new Set();

  function expand(name, depth) {
    if (depth > maxDepth) return null;
    const key = `${name}@${depth}`;
    if (visited.has(name)) return { name, version: lockDeps[name]?.version || '?', circular: true };
    visited.add(name);

    const info = lockDeps[name];
    if (!info) return { name, version: '?', missing: true };

    const children = (info.dependencies || [])
      .filter(d => !options.prodOnly || !info.dev)
      .map(d => expand(d, depth + 1))
      .filter(Boolean);

    visited.delete(name);
    return { name, version: info.version, children, dev: info.dev };
  }

  const rootDeps = Object.keys(pkgJson.dependencies || {});
  const rootDevDeps = options.prodOnly ? [] : Object.keys(pkgJson.devDependencies || {});
  const allRoot = [...rootDeps, ...rootDevDeps];

  const children = allRoot.map(d => expand(d, 1)).filter(Boolean);
  return { name: pkgJson.name || 'root', version: pkgJson.version || '0.0.0', children };
}

// ── ASCII Renderer ──────────────────────────────────────────────────

function renderAscii(tree, options = {}) {
  const lines = [];
  const showVersion = options.showVersion !== false;
  const colorize = options.color && process.stdout.isTTY;

  const GREEN = '\x1b[32m', YELLOW = '\x1b[33m', RED = '\x1b[31m', GRAY = '\x1b[90m', RESET = '\x1b[0m';

  function walk(node, prefix, isLast) {
    const connector = isLast ? '└── ' : '├── ';
    let label = node.name;
    if (showVersion && node.version && node.version !== '?') label += `@${node.version}`;
    if (node.circular) label += ` ${GRAY}(circular)${RESET}`;
    if (node.missing) label += ` ${RED}(missing)${RESET}`;
    if (node.dev) label = `${YELLOW}${label}${RESET}`;
    if (colorize && !node.dev && !node.circular && !node.missing) label = `${GREEN}${label}${RESET}`;

    lines.push(prefix + connector + label);

    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    const children = node.children || [];
    children.forEach((child, i) => {
      walk(child, childPrefix, i === children.length - 1);
    });
  }

  lines.push(`${tree.name}@${tree.version}`);
  (tree.children || []).forEach((child, i) => {
    walk(child, '', i === tree.children.length - 1);
  });

  return lines.join('\n');
}

// ── SVG Renderer ────────────────────────────────────────────────────

function renderSvg(tree, options = {}) {
  const nodeW = 160, nodeH = 36, hGap = 20, vGap = 60;
  const showVersion = options.showVersion !== false;

  // Calculate positions via simple layered layout
  const nodes = [];
  const edges = [];
  let idCounter = 0;

  function layout(node, depth, xOffset) {
    const id = idCounter++;
    const label = showVersion && node.version ? `${node.name}@${node.version}` : node.name;
    const childCount = (node.children || []).length;

    nodes.push({ id, label, depth, xOffset, circular: !!node.circular, missing: !!node.missing });

    let totalWidth = 0;
    const childIds = [];
    for (const child of (node.children || [])) {
      const childId = layout(child, depth + 1, xOffset + totalWidth);
      childIds.push(childId);
      totalWidth += Math.max(1, subtreeWidth(child));
    }

    for (const cid of childIds) {
      edges.push({ from: id, to: cid });
    }

    return id;
  }

  function subtreeWidth(node) {
    const children = node.children || [];
    if (children.length === 0) return 1;
    return children.reduce((sum, c) => sum + subtreeWidth(c), 0);
  }

  const totalWidth = Math.max(1, subtreeWidth(tree));
  layout(tree, 0, 0);

  // Map nodes to pixel positions
  const depthGroups = {};
  for (const n of nodes) {
    if (!depthGroups[n.depth]) depthGroups[n.depth] = [];
    depthGroups[n.depth].push(n);
  }

  // Re-layout with proper x positions
  const positions = {};
  let leafIndex = 0;

  function assignPositions(node, depth) {
    const children = node.children || [];
    if (children.length === 0) {
      const nd = nodes.find(n => n.label === (showVersion && node.version ? `${node.name}@${node.version}` : node.name) && !positions[nodes.indexOf(n)]);
      // simple: use sequential leaf positions
      return leafIndex++;
    }
    let minPos = Infinity, maxPos = -Infinity;
    for (const child of children) {
      const p = assignPositions(child, depth + 1);
      minPos = Math.min(minPos, p);
      maxPos = Math.max(maxPos, p);
    }
    return (minPos + maxPos) / 2;
  }

  // Simpler approach: assign x by index within depth
  const nodePositions = [];
  let idx = 0;
  function assignSimple(node, depth) {
    const myIdx = idx++;
    const children = (node.children || []);
    const childIdxs = children.map(c => assignSimple(c, depth + 1));
    const x = children.length === 0 ? myIdx : (childIdxs[0] + childIdxs[childIdxs.length - 1]) / 2;
    nodePositions.push({ label: showVersion && node.version ? `${node.name}@${node.version}` : node.name, x, y: depth, circular: !!node.circular, missing: !!node.missing });
    return x;
  }
  assignSimple(tree, 0);

  const svgW = Math.max(400, (nodePositions.length + 1) * (nodeW / 3));
  const svgH = Math.max(300, (Math.max(...nodePositions.map(n => n.y)) + 2) * vGap + nodeH * 2);
  const scale = Math.min(1, 800 / svgW);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(svgW * scale + 40)} ${svgH}" width="${Math.ceil(svgW * scale + 40)}" height="${svgH}">\n`;
  svg += `  <style>
    text { font-family: monospace; font-size: 11px; fill: #333; }
    .node-rect { rx: 6; ry: 6; }
    .edge { stroke: #999; stroke-width: 1.5; fill: none; }
    .circular .node-rect { fill: #fff3cd; }
    .missing .node-rect { fill: #f8d7da; }
  </style>\n`;

  // Re-build edges
  const edgeList = [];
  idx = 0;
  function buildEdges(node) {
    const myIdx = idx++;
    for (const child of (node.children || [])) {
      const childIdx = idx;
      buildEdges(child);
      edgeList.push([myIdx, childIdx]);
    }
  }
  buildEdges(tree);

  // Render edges
  for (const [fi, ti] of edgeList) {
    const from = nodePositions[fi], to = nodePositions[ti];
    const fx = from.x * (nodeW / 3) * scale + 20 + nodeW * scale / 2;
    const fy = from.y * vGap + 20 + nodeH;
    const tx = to.x * (nodeW / 3) * scale + 20 + nodeW * scale / 2;
    const ty = to.y * vGap + 20;
    svg += `  <path class="edge" d="M${fx},${fy} C${fx},${fy + vGap / 2} ${tx},${ty - vGap / 2} ${tx},${ty}"/>\n`;
  }

  // Render nodes
  for (const n of nodePositions) {
    const x = n.x * (nodeW / 3) * scale + 20;
    const y = n.y * vGap + 20;
    const w = nodeW * scale;
    const cls = n.circular ? 'circular' : n.missing ? 'missing' : '';
    const fill = n.circular ? '#fff3cd' : n.missing ? '#f8d7da' : '#e8f4f8';
    const stroke = n.circular ? '#ffc107' : n.missing ? '#dc3545' : '#4a9eff';
    svg += `  <g class="${cls}">\n`;
    svg += `    <rect class="node-rect" x="${x}" y="${y}" width="${w}" height="${nodeH}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>\n`;
    svg += `    <text x="${x + w / 2}" y="${y + nodeH / 2 + 4}" text-anchor="middle">${escapeXml(n.label)}</text>\n`;
    svg += `  </g>\n`;
  }

  svg += '</svg>';
  return svg;
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Stats ───────────────────────────────────────────────────────────

function computeStats(tree) {
  let total = 0, unique = new Set(), maxDepth = 0, circular = 0, missing = 0, devCount = 0;

  function walk(node, depth) {
    total++;
    unique.add(node.name);
    if (depth > maxDepth) maxDepth = depth;
    if (node.circular) circular++;
    if (node.missing) missing++;
    if (node.dev) devCount++;
    for (const child of (node.children || [])) walk(child, depth + 1);
  }

  for (const child of (tree.children || [])) walk(child, 1);
  return { total, unique: unique.size, maxDepth, circular, missing, devCount };
}

// ── Public API ──────────────────────────────────────────────────────

module.exports = {
  parseLockfile,
  parsePackageLock,
  parseYarnLock,
  parsePnpmLock,
  buildTree,
  renderAscii,
  renderSvg,
  computeStats,
};
