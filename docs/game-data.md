# Game data

[Development guide](development.md)

## Updating game data

Export data from your installed Factorio game:

```bash
npm run data:generate
```

Generating both profiles requires the Space Age expansion. For a base-only installation, use `npm run data:generate -- --profile base`.

On macOS the gatherer defaults to the Steam installation at:

```text
~/Library/Application Support/Steam/steamapps/common/Factorio/factorio.app/Contents/MacOS/factorio
```

To use another macOS installation, pass the executable explicitly:

```bash
npm run data:generate -- --factorio "/path/to/factorio.app/Contents/MacOS/factorio"
```

`FACTORIO_BIN` also overrides the executable. The gatherer targets the macOS app layout; other operating systems are not currently supported.

It runs Factorio's `--dump-data`, `--dump-prototype-locale`, and `--dump-icon-sprites` commands in an isolated directory at `.cache/factorio-export/`. Each profile has its own cache at `.cache/factorio-export/<profile>/`, with English localization and default startup settings. The `space-age` profile enables `base`, `elevated-rails`, `quality`, and `space-age`. The `base` profile enables only `base`, explicitly disabling the three expansion mods. This represents base Factorio 2.x, not Factorio 1.1 or base with optional expansion mods. Saves and your personal configuration/mod directory are never read or modified. The graphical icon export requires a desktop session and, for the Steam build, Steam. It may briefly open a game window.

To export just one profile, use `--profile base` or `--profile space-age` (the default is `--profile all`). A base-only export does not require the expansion data files.

To reprocess the last successful exports without launching Factorio:

```bash
npm run data:generate -- --reuse-exports
```

Add `--profile base` or `--profile space-age` to reuse just that profile. Cached exports must match the requested profile, mod versions, startup settings, and source hashes. To refresh after a game update, run without `--reuse-exports`. Full dumps, logs, Steam bootstrap files, and temporary files remain ignored in `.cache/`.

The gatherer validates every technology, prerequisite, research cost, trigger, effect reference, and selected PNG before replacing website data. Unknown effects or triggers fail explicitly. After generation, run the [development checks](development.md#checks) and review the data/asset diff.

## Data contract

Both profiles are independently exported from the same installed game version in English. They represent the game's prototype defaults, not the progress, difficulty settings, or script-driven changes in a save. Space Age changes existing research as well as adding technologies, so base research is never derived by filtering the expansion dataset.

- IDs are native prototype names. Dependencies come exclusively from `prerequisites`; outgoing edges are derived from them.
- Research uses either numeric science costs (or a separate `count_formula`) or a structured `research_trigger`.
- Research levels and infinite status are explicit. Infinite research does not create a self-dependency. Formula-based and repeatable research is excluded from finite ancestor cost totals.
- Descriptions come from Factorio's resolved English locale. Rich-text references become localized names. When a technology has no description, a factual summary is built from its visible effects and marked with `description_source: "effects"`.
- Effects retain their native type, targets, and modifiers, with display text and applicable icons. Hidden effects remain in the dataset but are omitted from the details panel.
- Hidden technologies and disabled technologies that are not marked visible are omitted from the graph. A visible technology depending on one fails explicitly rather than silently dropping an edge.
- Graph depth (`level`) is computed separately from the technology's research level (`research_level`).

Each profile is validated and published independently; refreshing one cannot overwrite the other's data or icons. Both datasets are validated at build time and supplied to the client for immediate switching.

Generation is deterministic for identical exports; the manifest records input hashes instead of changing timestamps. All selected icons are validated as square PNGs, with at least 256 pixels for technologies and 64 pixels for other icons.
