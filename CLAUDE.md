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

---

## Architecture

### Data Flow

1. **Crawler** scrapes the Factorio Wiki and writes `tech_tree.jsonl` — one JSON record per line (`TechNode`), with fields `id`, `title`, `url`, `required_technologies`, `required_technologies_merged`, `image_path`, `research_type`, `research_science`, `research_condition_text`.
2. **Data files** live in `factorio-tech-tree/data/`: `tech_tree.jsonl` (nodes) and `tech_images/` (PNG images, served as static assets from `public/`).
3. **`load-tech-tree.ts`** runs server-side at build time: reads the JSONL, strips self-loops, resolves dependency levels via topological sort, produces `GraphNode[]` and `GraphEdge[]`, and returns `TechTreeData`.
4. **`page.tsx`** is an async Server Component that calls `loadTechTree()` and passes the result to the client component `TechGraph`.

### Type System

Two distinct node shapes are used:

- **`TechNode`** (`lib/tech-tree/types.ts`) — raw shape as written by the crawler. All fields beyond `id` and `title` are optional.
- **`GraphNode`** (`lib/tech-tree/types.ts`) — processed shape consumed by the UI. Has `prerequisites: string[]`, `level: number`, and `is_infinite: boolean` resolved by the loader. `is_infinite` is `true` when the raw record has a self-referential dependency (e.g., `mining_productivity_1` requires itself), which is how Factorio encodes infinite/repeatable research.
- **`GraphEdge`** — `{ id: string; from: string; to: string }`. Edge IDs are `"${from}::${to}"`.
- **`TechTreeData`** — `{ nodes, edges, root_ids, max_level }` returned by the loader.
- **`GraphEdgePath`** (`lib/tech-graph/types.ts`) — `GraphEdge & { path: string }`, the SVG path string attached during `useMemo` in `TechGraph`.
- **`GraphSelection`** (`lib/tech-graph/types.ts`) — discriminated union: `{ mode: "none" }` or `{ mode: "node"; incoming_edges; outgoing_edges; incoming_nodes; outgoing_nodes }`.
- **`Transform`** (`lib/tech-graph/types.ts`) — `{ x: number; y: number; scale: number }` for the pan/zoom viewport.

### Data Loading Pipeline (`load-tech-tree.ts`)

The loader runs four sequential passes:

1. **`parse_nodes`** — splits JSONL lines and JSON-parses each into `TechNode[]`.
2. **`build_dependencies`** — prefers `required_technologies_merged` over `required_technologies`, filters out self-loops and references to unknown nodes, and collects `self_loop_ids` (infinite research markers).
3. **`build_levels`** — topological sort: iterates until stable, assigning each node `level = max(dep levels) + 1`. Nodes with no deps get level 0 (roots). Cyclic nodes (if any) are assigned a best-effort level from whatever deps resolved.
4. **`build_graph_nodes`** / **`build_edges`** — assembles the final `GraphNode[]` and `GraphEdge[]`.

### Next.js App File Structure

```
app/
  page.tsx                          # Async Server Component; loads data, renders TechGraph
  layout.tsx                        # Root layout; sets <html> attributes, global styles
  tech-graph.tsx                    # Root client component ("use client"); orchestrates all state

  hooks/
    use_pan_zoom.ts                 # Pan/zoom transform state, pointer/wheel handlers, animate_to, fit_to_view
    use_history_navigation.ts       # Back/forward navigation stack (capped at 100); keyboard shortcuts
    use_filter_state.ts             # Active science-pack filters, search query, depth mode (with localStorage)

  components/
    theme-toggle.tsx                # Light/dark theme toggle button
    depth-toggle.tsx                # Toggle between "direct" and "ancestors" highlight depth
    tech-graph/
      graph-canvas.tsx              # Full SVG canvas: toolbar, filter panel, search, edges, nodes
      graph-details.tsx             # Right-hand side panel for selected node details

  lib/
    tech-tree/
      types.ts                      # TechNode, GraphNode, GraphEdge, TechTreeData, ResearchScience
      load-tech-tree.ts             # Server-side JSONL loader and graph builder
    tech-graph/
      types.ts                      # Transform, GraphEdgePath, GraphSelection
      constants.ts                  # Node dimensions, zoom limits, science pack name map
      graph-layout.ts               # build_layout(): level-based trunk + side-lane layout algorithm
      utils.ts                      # format_title, get_node_height, get_node_icon_path, get_science_pack_icons, clamp
```

### Component Responsibilities

**`TechGraph` (`tech-graph.tsx`)** — the top-level client component. It owns:
- `selected_node_id` state and `container_ref`
- Layout computation (`build_layout`) and edge SVG path generation
- `selection_index` — pre-built map from node ID → direct neighbours + highlighted edge/node sets (O(1) lookup at interaction time)
- `ancestors_index` — pre-built map from node ID → all transitive ancestors via BFS (for "ancestors" depth mode, also O(1) at interaction time)
- `filter_match_ids` — which nodes pass the active science-pack filter
- `search_matches` / `search_match_ids`
- Delegates pan/zoom to `use_pan_zoom`, filter/search/depth to `use_filter_state`, navigation to `use_history_navigation`

**`GraphCanvas` (`components/tech-graph/graph-canvas.tsx`)** — pure rendering. Receives all state and callbacks as props; no local state except `controls_width` (a `ResizeObserver` that keeps the toolbar and filter panel the same width). Contains:
- Toolbar: zoom in/out/reset, `DepthToggle`, `ThemeToggle`
- Filter panel: science-pack toggle buttons + misc, select/deselect all
- Search input + result list
- Keyboard shortcut hints and credit footer
- SVG layer: `group-column-bg` rects for infinite-research side lanes, bezier-curve edges
- Node layer: `GraphNodeButton` sub-component rendered per node

**`GraphDetails` (`components/tech-graph/graph-details.tsx`)** — right-hand side panel. Renders the selected node's icon, title, wiki link, research requirements (science packs or condition text), prerequisite list ("Required Research"), and unlock list ("Allows"). All node links call `on_focus_node` to pan the canvas to that node.

### Custom Hooks

**`use_pan_zoom`** — manages `Transform` state. Key behaviours:
- `fit_to_view`: scales the layout to fill the container (capped at 1× max); re-runs on window resize.
- `animate_to(center_x, center_y)`: cubic ease-out animation (440ms) that pans to place a point at the container centre without changing scale.
- Wheel zoom is anchored at the cursor position; uses a non-passive listener so `preventDefault()` can suppress native scroll.
- `transform_ref` is a mutable ref kept in sync with `transform` state, so event handlers can read the latest value without stale closures.
- `on_canvas_click` (bare click without drag) is stored in a ref to avoid re-registering pointer handlers on every render.

**`use_history_navigation`** — browser-style back/forward stack stored in a ref (not state, since stack changes alone don't need re-renders). `record_history` truncates forward entries on a new selection; the stack is capped at 100 entries (trimmed from the front). Registers `keydown` listeners: `Backspace` = back, `Enter` = forward (skipped when focus is in a text input).

**`use_filter_state`** — active filters initialise to all IDs; `depth_mode` persists to `localStorage` (`"depth_mode"` key, values `"direct"` | `"ancestors"`). Search query is plain state (not persisted).

### Graph Layout (`graph-layout.ts`)

`build_layout(nodes)` runs in six phases:

1. **Sizing** — assigns each node `{ width: node_width, height: get_node_height(node) }`. Normalises all nodes in a level to share the tallest node's height so edge endpoints align.
2. **Partitioning** — calls `detect_group_membership` to identify infinite research groups. A group is any set of nodes with IDs matching `(base)_1`, `(base)_2`, ..., `(base)_N[-inf]` where `(base)_1` exists. Groups with ≤2 members are merged back into the trunk.
3. **Trunk geometry** — computes `trunk_zone_width` = `max_nodes_per_level × node_width + gaps`.
4. **Side-lane geometry** — group bases are sorted alphabetically and assigned alternating left/right lanes (index 0 = innermost). Each lane is `node_width` wide with `lane_col_gap` between adjacent lanes. `trunk_side_gap` separates the trunk from the nearest lane.
5. **Position assignment** — trunk nodes are centred within the trunk zone per level. Side-lane nodes are placed in their fixed column at the shared row y for their level.
6. **Bounding boxes** — computes `GroupColumn` rects (with `col_padding_x` horizontal and `col_padding` vertical padding) for the background highlight rects rendered in the SVG.

Returns `Layout`: `{ width, height, positions, sizes, group_columns }`.

### Node Height Computation (`utils.ts → get_node_height`)

Height is calculated analytically (not measured from the DOM) so the layout can run server-side or in a memo. Formula:

```
padding_top + icon_size + item_gap + title_height + science_height + science_gap + padding_bottom
```

Title height uses a character-width estimator (`avg_char_width = font_size × 0.56`) to approximate line wrapping. All constants live in `constants.ts`.

### Selection and Highlight System

Two pre-computed indices in `TechGraph`:

- **`selection_index`** — built once per `edges`/`nodes` change. Maps each node ID to its direct `incoming_nodes`, `outgoing_nodes`, `highlighted_edge_ids`, and `related_node_ids`. Lookups at click time are O(1).
- **`ancestors_index`** — built once per `edges`/`nodes` change. BFS from each node following incoming edges to collect all transitive ancestors (Phase 1), then a second pass collects all edges within that subgraph (Phase 2, needed because BFS can skip edges whose first endpoint was already visited via another path).

`highlighted_edge_ids` and `related_node_ids` merge direct + ancestor sets when `depth_mode === "ancestors"`.

Clicking a node calls `select_node` (records history, sets `selected_node_id` without panning). Clicking a link in the details panel or a search result calls `focus_node` (records history, sets node, and animates the viewport to centre on it).

### Edge Rendering

Edges are cubic bezier curves computed in `TechGraph` via `useMemo`:
- Start: bottom-centre of the source node
- End: top-centre of the destination node
- Control points: both at 55% of the vertical span from the start, giving a curve weighted toward the source

Self-loop edges and edges with missing layout positions are silently dropped.

### Science Pack Filtering

The filter panel shows one button per science pack (from `science_pack_name_map` in `constants.ts`) plus a "misc" button for non-science nodes. A science node passes the filter only if **all** its required packs are in `active_filters`. Non-science nodes pass only if misc is active.

### Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Backspace` | Navigate back in selection history |
| `Enter` | Navigate forward in selection history |

Both are suppressed when focus is inside an `<input>`, `<textarea>`, `<select>`, or `contenteditable` element.

### Naming Conventions

- TypeScript: `snake_case` for all variables, functions, props, and hook names. This is intentional and project-wide — do not use `camelCase`.
- Component filenames: `kebab-case` (e.g., `graph-canvas.tsx`, `depth-toggle.tsx`).
- Hook filenames: `snake_case` to match the exported function name (e.g., `use_pan_zoom.ts`).
- CSS class names: `kebab-case` (e.g., `graph-node`, `is-selected`, `details-section-title`).

---

## Crawler Structure

- `config.py` — Root URLs and default output path
- `crawl.py` — BFS graph traversal from root URLs; converts edge references to internal IDs and inverts edges
- `parsing.py` — BeautifulSoup HTML parsing for individual research pages
- `models.py` — Data models for crawled records
- `http_client.py` — Requests session setup
- `io_utils.py` — JSONL write utility
