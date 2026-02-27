import fs from "node:fs/promises";
import path from "node:path";

type TechNode = {
  id: string;
  title: string;
  required_technologies?: string[];
  required_technologies_merged?: string[];
  image_path?: string;
};

type LayeredTech = {
  layers: TechNode[][];
  levels: Map<string, number>;
  rootIds: Set<string>;
};

const dataPath = path.join(process.cwd(), "data", "tech_tree.jsonl");

async function loadTechTree(): Promise<LayeredTech> {
  const raw = await fs.readFile(dataPath, "utf-8");
  const nodes = raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TechNode);

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const dependencies = new Map(
    nodes.map((node) => [
      node.id,
      node.required_technologies_merged ?? node.required_technologies ?? [],
    ]),
  );

  const levels = new Map<string, number>();
  const rootIds = new Set<string>();
  const remaining = new Set(nodes.map((node) => node.id));
  let remainingLast = remaining.size + 1;

  while (remaining.size > 0 && remaining.size < remainingLast) {
    remainingLast = remaining.size;
    for (const id of Array.from(remaining)) {
      const deps = dependencies.get(id) ?? [];
      if (deps.length === 0) {
        levels.set(id, 0);
        rootIds.add(id);
        remaining.delete(id);
        continue;
      }

      const resolved = deps.filter((dep) => levels.has(dep));
      if (resolved.length === deps.length) {
        const maxLevel = Math.max(
          ...resolved.map((dep) => levels.get(dep) ?? 0),
        );
        levels.set(id, maxLevel + 1);
        remaining.delete(id);
      }
    }
  }

  for (const id of remaining) {
    const deps = dependencies.get(id) ?? [];
    const resolved = deps
      .map((dep) => levels.get(dep))
      .filter((value): value is number => value !== undefined);
    const fallbackLevel = resolved.length > 0 ? Math.max(...resolved) + 1 : 0;
    levels.set(id, fallbackLevel);
  }

  const maxLevel = Math.max(...Array.from(levels.values()));
  const layers: TechNode[][] = Array.from(
    { length: maxLevel + 1 },
    () => [],
  );

  for (const [id, level] of levels.entries()) {
    const node = nodesById.get(id);
    if (!node) {
      continue;
    }
    layers[level].push(node);
  }

  for (const layer of layers) {
    layer.sort((a, b) => a.title.localeCompare(b.title));
  }

  return { layers, levels, rootIds };
}

function formatTitle(title: string) {
  return title.replace(/\s*\(research\)\s*$/i, "").trim();
}

export default async function Home() {
  const { layers, levels, rootIds } = await loadTechTree();
  const totalNodes = Array.from(levels.keys()).length;
  const totalLayers = layers.length;
  return (
    <div className="page">
      <header className="header">
        <div className="title">Factorio Tech Tree</div>
        <div className="subtitle">
          Each row represents the distance from the root technologies. Scroll
          horizontally within a row to explore the full layer.
        </div>
        <div className="summary">
          <span>{totalNodes} techs</span>
          <span>{totalLayers} layers</span>
          <span>{rootIds.size} roots</span>
        </div>
      </header>
      <main className="layers">
        {layers.map((layer, index) => (
          <section
            key={`layer-${index}`}
            className="layer"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <div className="layer-header">
              <div className="layer-title">Layer {index}</div>
              <div className="layer-meta">{layer.length} techs</div>
            </div>
            <div className="layer-row">
              {layer.map((node) => {
                const prereqCount =
                  node.required_technologies_merged?.length ??
                  node.required_technologies?.length ??
                  0;
                const isRoot = rootIds.has(node.id);
                return (
                  <div
                    key={node.id}
                    className={`node${isRoot ? " node-root" : ""}`}
                  >
                    <div className="node-icon">
                      <img
                        src={`/api/tech-image?path=${encodeURIComponent(
                          node.image_path ?? "",
                        )}`}
                        alt={formatTitle(node.title)}
                        loading="lazy"
                      />
                    </div>
                    <div className="node-title">{formatTitle(node.title)}</div>
                    <div className="node-meta">
                      {prereqCount} prereq{prereqCount === 1 ? "" : "s"} •{" "}
                      {node.id}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
