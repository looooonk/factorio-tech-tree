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

The Next.js 16, React 19, TypeScript, and Tailwind CSS v4 app lives at repository root.
`data-gatherer/` exports and normalizes the installed macOS Factorio + Space Age game.
There is no web scraper.

Run app commands from repository root:

```bash
npm ci
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

## Data Flow and Contracts

1. `data-gatherer/export.ts` runs Factorio's data, locale, and icon exports with an isolated
   English profile containing only base, elevated-rails, quality, and space-age.
2. `data-gatherer/normalize.ts` resolves native IDs, prerequisites, science costs, triggers,
   research levels, descriptions, and effects. Missing descriptions use factual effect summaries.
3. `data-gatherer/cli.ts` validates and stages all output before publishing `data/tech_tree.jsonl`,
   `data/manifest.json`, and selected icons in `public/data/`.
4. `app/lib/tech-tree/load-tech-tree.ts` validates data at build time and computes graph depth.
5. `app/page.tsx` passes the graph and science-pack metadata to the client-side `TechGraph`.

Use `npm run data:generate` only when fresh game data is required. Use
`npm run data:generate -- --reuse-exports` to normalize a previously verified export.
The default executable is the macOS Steam installation; `--factorio` or `FACTORIO_BIN`
can override it. Keep all working files under `.cache/factorio-export/`.
Never read or modify saves or use the player's personal mod/config directory for exports.
Website builds must work without a Factorio installation.

Native prototype names are canonical IDs. Prerequisites must resolve and may not contain
self-loops or cycles. Repeatability comes from explicit `max_research_level` and `is_infinite`
fields, never from self-references or display names. Do not confuse graph depth (`level`)
with research level (`research_level`). Edge IDs use `${from}::${to}`.

Science packs have independent IDs, localized names, image paths, and technology references.
Descriptions always have text and a `description_source` of `locale` or `effects`.
Preserve native effect fields and structured research triggers. Fail on unsupported data
rather than silently omitting it. Full game dumps and installation paths are not committed.

When changing the contract, inspect:

- `data-gatherer/types.ts`
- `data-gatherer/normalize.ts`
- `app/lib/tech-tree/types.ts`
- `app/lib/tech-tree/validate.ts`
- `app/lib/tech-tree/load-tech-tree.ts`

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

## Visual Design

The app should feel native to Factorio's interface: functional, industrial,
compact, and focused on the technology graph.

- Use the fixed dark graphite palette, warm orange highlights, hard-edged frames,
  inset controls, and restrained texture established in `globals.css` and `graph.css`.
- Reuse Factorio technology and science-pack assets as the primary visual identity.
- Keep controls, nodes, and details visually consistent with one window system.
- Favor strong contrast and clear hierarchy; decoration should reinforce state or structure.
- Preserve smooth navigation. Pan and zoom should stay off React's render path, and graph
  elements should avoid paint-heavy effects that compromise interaction performance.

## Style Conventions

- Use `snake_case` for TypeScript variables, functions, and props.
- Custom hooks must use React's `useCamelCase` naming so hook lint rules recognize them.
- Use `kebab-case` for component filenames and CSS classes.
- Keep hook filenames in `snake_case`.
- Keep code concise, but do not trade clarity for "black magic."
- Follow the existing four-space indentation where present.

Comments should be brief and explain only non-obvious intent or constraints.
Do not narrate code that is already clear from the implementation.
Do not add delimiter comments.
Use ASCII only in source-code comments.

## Validation by Scope

For app and gatherer changes, run relevant focused tests followed by:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

For gatherer changes, test valid and invalid fixtures. When game exports are available,
regenerate and verify deterministic output, resolved dependencies, description coverage,
effect references, and icons. Do not rely only on the current live game installation.

Before handing off:

- Review the diff for unrelated edits and unintended generated files.
- Verify the browser's search, details, filters, navigation, ancestor highlights, and pan/zoom.
- Report checks run and any remaining uncertainty.
