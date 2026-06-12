# depgraph-viz

Visualize your npm dependency tree from lockfiles. ASCII art or SVG — pick your flavor.

## Why

`npm ls` exists but it's noisy, slow, and the output isn't great for sharing. This tool reads your lockfile directly (no node_modules needed), builds the full dependency tree, and renders it as a clean ASCII tree or an SVG you can drop in a docs folder.

Zero dependencies. Works with npm, yarn, and pnpm lockfiles.

## Install

```bash
npm install -g depgraph-viz
```

Or use without installing:

```bash
npx depgraph-viz
```

## Usage

```bash
# ASCII tree (default)
depgraph-viz

# SVG output, save to file
depgraph-viz --svg -o deps.svg

# Production deps only, with stats
depgraph-viz --prod --stats

# Limit depth for large projects
depgraph-viz --max-depth 3

# No colors (piping, CI)
depgraph-viz --no-color
```

## Options

| Flag | Description |
|------|-------------|
| `--ascii` | ASCII tree output (default) |
| `--svg` | SVG diagram output |
| `--no-version` | Hide version numbers |
| `--prod` | Production dependencies only |
| `--no-color` | Disable colored output |
| `--stats` | Print dependency statistics |
| `--max-depth <n>` | Max tree depth (default: 10) |
| `-o <file>` | Write output to file |

## Programmatic API

```js
const { parseLockfile, buildTree, renderAscii, renderSvg, computeStats } = require('depgraph-viz');

const lockDeps = parseLockfile('./package-lock.json');
const pkgJson = require('./package.json');
const tree = buildTree(pkgJson, lockDeps, { maxDepth: 5 });

console.log(renderAscii(tree));
// or: renderSvg(tree) → SVG string

const stats = computeStats(tree);
// { total, unique, maxDepth, circular, missing, devCount }
```

## What it detects

- **Circular dependencies** — marked in the tree, counted in stats
- **Missing packages** — listed in package.json but not in lockfile
- **Dev dependencies** — highlighted separately
- **Tree depth** — useful for spotting deep dependency chains

## Lockfile support

- `package-lock.json` (npm)
- `yarn.lock` (yarn v1)
- `pnpm-lock.yaml` (pnpm)

Auto-detected by filename. No configuration needed.

## License

MIT
