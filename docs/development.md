# Development

[Contributing guidelines](../CONTRIBUTING.md) · [Game data guide](game-data.md)

## Local setup

Requires Node.js 22 or newer. Run all commands from the repository root:

```bash
npm ci
npm run dev
```

The generated dataset and icons are committed. Developing, testing, and building the website do not require Factorio, Steam, Python, or access to the Wiki.

## Checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Repository layout

| Path | Purpose |
| --- | --- |
| `app/` | Next.js technology graph and details panel |
| `data-gatherer/` | TypeScript export runner, normalization, and tests |
| `data/<profile>/tech_tree.jsonl` | Normalized research data |
| `data/<profile>/manifest.json` | Game version, mod profile, input hashes, description counts, and science-pack metadata |
| `public/data/<profile>/` | Selected exported technology, science-pack, recipe, quality, and location icons |

## Edition switching

Use the top-right selector to switch between Space Age and base Factorio 2.x. Switching resets the selection, search, science filters, navigation history, and viewport; the highlight-depth preference is retained.

## Deployment

The Next.js application and package files are at the repository root. Configure hosting to use the repository root (not the former nested `factorio-tech-tree/` directory), with `npm run build`. Deployments consume committed data; do not run the gatherer during a hosting build.
