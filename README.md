# depgraph-viz

Visualize your npm dependency tree — as ASCII in your terminal or as an SVG file. Zero dependencies.

## Why?

`npm ls` is fine, but it's noisy and there's no easy way to get a visual overview. This tool gives you a clean ASCII tree for quick scans and SVG output for documentation or slides.

## Install

```bash
npm install -g depgraph-viz
```

Or use without installing:

```bash
npx depgraph-viz .
```

## Usage

### ASCII tree (default)

```bash
depgraph-viz                    # current directory
depgraph-viz ~/projects/my-app  # specific project
depgraph-viz . --no-dev         # hide devDependencies
```

Output:
```
my-app@2.1.0
├── express@4.18.2
│   ├── accepts@~1.3.8
│   ├── body-parser@1.20.1
│   └── cookie@0.5.0
├── lodash@4.17.21
└── jest@29.7.0 (dev)
```

### SVG output

```bash
depgraph-viz --svg                # writes depgraph.svg
depgraph-viz --svg graph.svg      # custom filename
```

### Statistics

```bash
depgraph-viz --stats
```

Shows dep counts, totals, and detects duplicate packages across the tree.

### Options

| Flag | Description |
|------|-------------|
| `--svg [file]` | Generate SVG (default: `depgraph.svg`) |
| `--stats` | Print dependency statistics |
| `--no-dev` | Exclude devDependencies |
| `--depth <n>` | Max tree depth (default: 4) |

## Features

- **Lockfile-aware** — reads `package-lock.json` for resolved versions and nested dependencies
- **No lockfile? No problem** — falls back to `package.json` ranges
- **Duplicate detection** — `--stats` flags packages appearing with multiple versions
- **Zero dependencies** — this tool doesn't add to your dep tree

## API

```js
const { parsePackage, toAscii, toSvg, getStats } = require('depgraph-viz');

const { tree } = parsePackage('/path/to/project');

// ASCII string
console.log(toAscii(tree, { showDev: true, maxDepth: 4 }));

// SVG string
const svg = toSvg(tree, { showDev: true, width: 900 });

// Stats object
const stats = getStats(tree);
```

## License

MIT
