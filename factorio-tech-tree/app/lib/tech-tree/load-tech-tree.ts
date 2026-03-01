import fs from "node:fs/promises";
import path from "node:path";

import type {
    GraphEdge,
    GraphNode,
    TechNode,
    TechTreeData,
} from "./types";

const data_path = path.join(process.cwd(), "data", "tech_tree.jsonl");

function parse_nodes(raw: string): TechNode[] {
    return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as TechNode);
}

function build_dependencies(nodes: TechNode[]) {
    const nodes_by_id = new Map(nodes.map((node) => [node.id, node]));
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
                .filter((dep) => nodes_by_id.has(dep)),
        ]),
    );

    return { dependencies, self_loop_ids };
}

function build_levels(nodes: TechNode[], dependencies: Map<string, string[]>) {
    const levels = new Map<string, number>();
    const root_ids = new Set<string>();
    const remaining = new Set(nodes.map((node) => node.id));
    let remaining_last = remaining.size + 1;

    // Resolve levels in topological order, then fall back for any cycles.
    while (remaining.size > 0 && remaining.size < remaining_last) {
        remaining_last = remaining.size;
        for (const id of Array.from(remaining)) {
            const deps = dependencies.get(id) ?? [];
            if (deps.length === 0) {
                levels.set(id, 0);
                root_ids.add(id);
                remaining.delete(id);
                continue;
            }

            const resolved = deps.filter((dep) => levels.has(dep));
            if (resolved.length === deps.length) {
                const max_level = Math.max(
                    ...resolved.map((dep) => levels.get(dep) ?? 0),
                );
                levels.set(id, max_level + 1);
                remaining.delete(id);
            }
        }
    }

    for (const id of remaining) {
        const deps = dependencies.get(id) ?? [];
        const resolved = deps
            .map((dep) => levels.get(dep))
            .filter((value): value is number => value !== undefined);
        const fallback_level = resolved.length > 0 ? Math.max(...resolved) + 1 : 0;
        levels.set(id, fallback_level);
    }

    return { levels, root_ids };
}

function build_graph_nodes(
    nodes: TechNode[],
    dependencies: Map<string, string[]>,
    levels: Map<string, number>,
    self_loop_ids: Set<string>,
): GraphNode[] {
    return nodes.map((node) => ({
        id: node.id,
        title: node.title,
        image_path: node.image_path,
        prerequisites: dependencies.get(node.id) ?? [],
        level: levels.get(node.id) ?? 0,
        is_infinite: self_loop_ids.has(node.id),
        research_type: node.research_type ?? null,
        research_science: node.research_science ?? null,
        research_condition_text: node.research_condition_text ?? null,
    }));
}

function build_edges(nodes: GraphNode[]): GraphEdge[] {
    const edges: GraphEdge[] = [];
    for (const node of nodes) {
        for (const dependency of node.prerequisites) {
            edges.push({
                id: `${dependency}::${node.id}`,
                from: dependency,
                to: node.id,
            });
        }
    }
    return edges;
}

export default async function loadTechTree(): Promise<TechTreeData> {
    const raw = await fs.readFile(data_path, "utf-8");
    const nodes = parse_nodes(raw);
    const { dependencies, self_loop_ids } = build_dependencies(nodes);
    const { levels, root_ids } = build_levels(nodes, dependencies);
    const graph_nodes = build_graph_nodes(nodes, dependencies, levels, self_loop_ids);
    const edges = build_edges(graph_nodes);
    const level_values = Array.from(levels.values());
    const max_level = level_values.length > 0 ? Math.max(...level_values) : 0;

    return {
        nodes: graph_nodes,
        edges,
        root_ids: Array.from(root_ids),
        max_level,
    };
}
