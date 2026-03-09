# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

| Path | Description |
| --- | --- |
| `crawler/` | Python crawler that scrapes the Factorio Wiki and exports `tech_tree.jsonl` |
| `factorio-tech-tree/` | Next.js 16 app (React 19, TypeScript, Tailwind CSS v4) that renders the tech tree |

## Commands

### Next.js App (`cd factorio-tech-tree`)

```bash
npm run dev      # start development server
npm run build    # production build
npm run lint     # run ESLint
```

### Crawler (`cd crawler`)

```bash
python -m venv .venv && source .venv/bin/activate
pip install requests beautifulsoup4

# Run and write output to the app's data directory
python main.py --output-jsonl ../factorio-tech-tree/data/tech_tree.jsonl

# Options
python main.py --sleep 0.5   # delay between page fetches (default: 0.1s)
python main.py --quiet       # suppress progress logs
```

## Architecture

### Data Flow

1. **Crawler** (`crawler/`) scrapes the Factorio Wiki and writes `tech_tree.jsonl` — one JSON record per line, each representing a tech node with fields like `id`, `title`, `url`, `required_technologies`, `required_technologies_merged`, `image_path`, `research_type`, `research_science`.
2. **Data files** live in `factorio-tech-tree/data/`: `tech_tree.jsonl` (tech nodes) and `tech_images/` (PNG images served as static assets from `public/`).
3. **`load-tech-tree.ts`** (`app/lib/tech-tree/load-tech-tree.ts`) is a server-side function that reads the JSONL at build/request time, resolves dependency levels via topological sort, builds `GraphNode[]` and `GraphEdge[]`, and returns `TechTreeData`.
4. **`page.tsx`** calls `loadTechTree()` (async Server Component), then renders the client component `TechGraph`.

### Next.js App Structure

- `app/page.tsx` — Server Component entry point; loads data and renders `TechGraph`
- `app/tech-graph.tsx` — Main client component (`"use client"`); owns all interaction state (pan/zoom, selection, filters, search, navigation history)
- `app/components/tech-graph/graph-canvas.tsx` — Renders the SVG canvas with nodes and bezier-curve edges
- `app/components/tech-graph/graph-details.tsx` — Side panel showing selected node details and prerequisite/unlock links
- `app/lib/tech-tree/` — Data types (`types.ts`) and JSONL loading logic (`load-tech-tree.ts`)
- `app/lib/tech-graph/` — Pure layout/rendering utilities: `graph-layout.ts` (level-based grid layout), `constants.ts` (sizes, zoom limits, science pack name map), `types.ts`, `utils.ts`

### Graph Layout

Nodes are arranged in a level-based grid. Level 0 = root nodes (no prerequisites). Level is computed as `max(prerequisite levels) + 1`. Within each level, nodes are sorted alphabetically by title. Edges are rendered as cubic bezier curves between node centers.

### Crawler Structure

- `config.py` — Root URLs and default output path
- `crawl.py` — BFS graph traversal from root URLs; converts edge references to internal IDs and inverts edges
- `parsing.py` — BeautifulSoup HTML parsing for individual research pages
- `models.py` — Data models for crawled records
- `http_client.py` — Requests session setup
- `io_utils.py` — JSONL write utility

### Naming Conventions

TypeScript files use `snake_case` for variables, functions, and props (not the typical JS `camelCase`). Component files use kebab-case filenames.
