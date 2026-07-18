# AGENTS.md

Guidance for coding agents working in this repository. These rules favor careful,
minimal changes over speculative speed.

## 1. Think Before Coding

Do not hide uncertainty or silently choose between materially different interpretations.

Before implementing:

- Inspect the relevant code and current repository state.
- State assumptions that affect behavior, data, or scope.
- Ask when ambiguity cannot be resolved safely from local context, and surface tradeoffs.
- Mention a simpler approach when it would satisfy the request.

## 2. Keep It Simple

Write the minimum code that fully solves the requested problem.

- Do not add unrequested features, configuration, or single-use abstractions.
- Prefer clear, direct code over clever compression.
- If the implementation is much larger than the problem, simplify it.

## 3. Make Surgical Changes

Every changed line should trace back to the request.

- Touch only the files needed for the task.
- Match existing patterns and naming, even if you prefer another style.
- Do not refactor, reformat, or clean up adjacent code without a reason.
- Remove code made unused by your changes; leave pre-existing dead code alone.
- Preserve unrelated user changes in a dirty worktree.

## 4. Work Toward Verifiable Goals

Translate requests into outcomes that can be checked.

- For a bug, reproduce it when practical, then verify the fix.
- For validation, exercise valid and invalid inputs.
- For refactors, compare behavior before and after.
- For multi-step work, use a short plan and run checks in proportion to risk.

Do not claim completion without reporting what was verified.

## Repository Scope

This repository has two independent working areas:

| Path | Responsibility |
| --- | --- |
| `crawler/` | Python crawler that scrapes Factorio Wiki research pages and emits JSONL |
| `factorio-tech-tree/` | Next.js 16, React 19, TypeScript, and Tailwind CSS v4 visualization app |

Keep changes within the relevant area unless the task changes their shared data contract.
If that contract changes, update both producer and consumer and regenerate data only when needed.

## Commands

Run app commands from `factorio-tech-tree/`:

```bash
npm run dev
npm run lint
npm run build
```

Set up and run the crawler from `crawler/`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install requests beautifulsoup4
python main.py --output-jsonl ../factorio-tech-tree/data/tech_tree.jsonl
```

Useful crawler options:

```bash
python main.py --sleep 0.5
python main.py --quiet
```

The default delay is 0.1 seconds; do not run a full crawl unless fresh data is required.

## Data Flow and Contracts

1. The crawler traverses research pages and writes one `TechNode` JSON object per line.
2. App source data lives at `factorio-tech-tree/data/tech_tree.jsonl`.
3. Icons are served from `factorio-tech-tree/public/data/tech_images/`.
4. `app/lib/tech-tree/load-tech-tree.ts` reads JSONL at build time.
5. `app/page.tsx` passes the processed graph to the client-side `TechGraph`.

The raw `TechNode` requires `id` and `title`; other crawler fields are optional.
Important fields include dependencies, URL, image path, research type, science packs, and condition text.

The loader prefers `required_technologies_merged` over `required_technologies`.
It ignores unknown dependencies and removes self-loops from edges while preserving `is_infinite` markers.
Do not remove this distinction: Factorio uses self-reference for repeatable research.

The loader assigns levels with a topological pass.
Roots have level 0; unresolved cycles receive a best-effort fallback level.
It returns `TechTreeData` with `nodes`, `edges`, `root_ids`, and `max_level`.
Edge IDs use `${from}::${to}`.

When editing the data contract, inspect these files together:

- `crawler/models.py`
- `crawler/crawl.py`
- `crawler/parsing.py`
- `factorio-tech-tree/app/lib/tech-tree/types.ts`
- `factorio-tech-tree/app/lib/tech-tree/load-tech-tree.ts`

## App Architecture

`app/tech-graph.tsx` is the top-level client component.
It owns selection state, layout and edge-path memoization, filtering, search,
precomputed relationship indexes, and coordination between custom hooks.

Rendering belongs in `app/components/tech-graph/`:

- `graph-canvas.tsx` renders controls, filters, search, SVG edges, and nodes.
- `graph-details.tsx` renders the selected technology and related links.
- Keep these components driven by props unless local render state is truly isolated.

Stateful behavior belongs in `app/hooks/`:

- `use_pan_zoom.ts` owns the viewport transform and pointer or wheel behavior.
- `use_history_navigation.ts` owns a back/forward selection stack capped at 100.
- `use_filter_state.ts` owns science filters, search, and persisted depth mode.

`Backspace` navigates backward and `Enter` navigates forward.
Do not trigger these shortcuts while focus is in an editable element.

`app/lib/tech-graph/graph-layout.ts` lays out nodes by level.
Normal nodes occupy a centered trunk; infinite research families occupy side lanes.
Groups with two or fewer members remain in the trunk.
Node height is calculated analytically in `utils.ts`, not measured from the DOM.
Keep layout constants in `constants.ts` and preserve aligned edge endpoints.

Selection uses precomputed direct-neighbor and ancestor indexes.
Ancestor highlighting must include every edge within the selected ancestor subgraph.
Node clicks select without panning; details and search links select and center the node.

A science node matches filters only when all required packs are active.
Non-science nodes are controlled by the `misc` filter.

## Crawler Architecture

- `config.py` defines root URLs and the default output path.
- `http_client.py` configures the requests session and fetches HTML.
- `parsing.py` extracts research records from individual pages.
- `crawl.py` performs BFS, normalizes references, and merges derived prerequisites.
- `models.py` defines raw and normalized records.
- `io_utils.py` writes JSONL output.
- `main.py` provides the command-line entry point.

Preserve crawler politeness controls and error records.
Do not make parsing depend on presentation details without checking representative pages.
When changing edge logic, preserve deduplication and internal-ID normalization.

## Style Conventions

- Use `snake_case` for TypeScript variables, functions, props, and hooks.
- Use `kebab-case` for component filenames and CSS classes.
- Use `snake_case` for hook filenames to match their exports.
- Keep code concise, but do not trade clarity for "black magic."
- Follow the existing four-space indentation where present.

Comments should be brief and explain only non-obvious intent or constraints.
Do not narrate code that is already clear from the implementation.
Do not add delimiter comments.
Use ASCII only in source-code comments.

## Validation by Scope

For app-only changes, run the checks relevant to the touched code:

```bash
cd factorio-tech-tree
npm run lint
npm run build
```

For crawler changes, run focused Python checks or a small fixture-based parse first.
Avoid using a live full crawl as the only validation because the wiki is external and mutable.

For generated data changes, verify that JSONL parses, IDs are unique,
dependencies resolve as expected, and the app still builds.

Before handing off:

- Review the diff for unrelated edits.
- Confirm generated artifacts were changed intentionally.
- Report checks run and any checks not run.
- Note remaining uncertainty rather than hiding it.
