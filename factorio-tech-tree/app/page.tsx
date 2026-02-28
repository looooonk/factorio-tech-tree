import fs from "node:fs/promises";
import path from "node:path";
import TechGraph from "./tech-graph";

type TechNode = {
  id: string;
  title: string;
  required_technologies?: string[];
  required_technologies_merged?: string[];
  image_path?: string;
};

type GraphNode = {
  id: string;
  title: string;
  image_path?: string;
  prerequisites: string[];
  level: number;
  is_infinite: boolean;
};

type GraphEdge = {
  id: string;
  from: string;
  to: string;
  is_self_loop?: boolean;
};

type TechTreeData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  root_ids: string[];
  max_level: number;
};

const dataPath = path.join(process.cwd(), "data", "tech_tree.jsonl");

async function loadTechTree(): Promise<TechTreeData> {
  const raw = await fs.readFile(dataPath, "utf-8");
  const nodes = raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TechNode);

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const raw_dependencies = new Map(
    nodes.map((node) => [
      node.id,
      node.required_technologies_merged ?? node.required_technologies ?? [],
    ]),
  );
  const self_loop_ids = new Set(
    nodes
      .filter((node) => {
        const merged = node.required_technologies_merged ?? [];
        const direct = node.required_technologies ?? [];
        return merged.includes(node.id) || direct.includes(node.id);
      })
      .map((node) => node.id),
  );
  const dependencies = new Map(
    nodes.map((node) => [
      node.id,
      (raw_dependencies.get(node.id) ?? [])
        .filter((dep) => dep !== node.id)
        .filter((dep) => nodesById.has(dep)),
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
  const graph_nodes: GraphNode[] = nodes.map((node) => ({
    id: node.id,
    title: node.title,
    image_path: node.image_path,
    prerequisites: dependencies.get(node.id) ?? [],
    level: levels.get(node.id) ?? 0,
    is_infinite: self_loop_ids.has(node.id),
  }));
  const edges: GraphEdge[] = [];

  for (const node of graph_nodes) {
    for (const dependency of node.prerequisites) {
      edges.push({
        id: `${dependency}::${node.id}`,
        from: dependency,
        to: node.id,
      });
    }
  }

  return {
    nodes: graph_nodes,
    edges,
    root_ids: Array.from(rootIds),
    max_level: maxLevel,
  };
}

export default async function Home() {
  const { nodes, edges, root_ids } = await loadTechTree();
  return (
    <main className="graph page">
      <TechGraph nodes={nodes} edges={edges} root_ids={root_ids} />
    </main>
  );
}
