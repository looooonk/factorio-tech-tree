import fs from "node:fs/promises";
import path from "node:path";

import type { DataManifest, GraphNode, TechNode, TechTreeData } from "./types";
import { validate_manifest, validate_nodes } from "./validate";
import { parse_game_profile, type GameProfile } from "./profiles";

export function build_graph(nodes: TechNode[], profile?: GameProfile): Omit<TechTreeData, "manifest"> {
    validate_nodes(nodes, profile);
    const visible = nodes.filter((node) => !node.hidden && (node.enabled || node.visible_when_disabled));
    const ids = new Set(visible.map((node) => node.id));
    const levels = new Map<string, number>();
    const remaining = new Map(visible.map((node) => [node.id, node]));
    for (const node of visible) {
        if (node.prerequisites.some((id) => !ids.has(id))) {
            throw new Error(`Visible technology depends on an unavailable technology: ${node.id}`);
        }
    }
    while (remaining.size) {
        for (const [id, node] of remaining) {
            if (node.prerequisites.every((dep) => levels.has(dep))) {
                levels.set(id, node.prerequisites.length
                    ? Math.max(...node.prerequisites.map((dep) => levels.get(dep)!)) + 1 : 0);
                remaining.delete(id);
            }
        }
    }
    const graph_nodes: GraphNode[] = visible.map((node) => ({ ...node, level: levels.get(node.id)! }));
    return {
        nodes: graph_nodes,
        edges: graph_nodes.flatMap((node) => node.prerequisites.map((from) => ({
            id: `${from}::${node.id}`, from, to: node.id,
        }))),
        root_ids: graph_nodes.filter((node) => !node.prerequisites.length).map((node) => node.id),
        max_level: Math.max(0, ...levels.values()),
    };
}

export default async function loadTechTree(profile: GameProfile = "space-age"): Promise<TechTreeData> {
    const directory = path.join(process.cwd(), "data", parse_game_profile(profile));
    const [raw, manifest_text] = await Promise.all([
        fs.readFile(path.join(directory, "tech_tree.jsonl"), "utf8"),
        fs.readFile(path.join(directory, "manifest.json"), "utf8"),
    ]);
    const nodes: TechNode[] = raw.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
    const manifest: DataManifest = JSON.parse(manifest_text);
    validate_manifest(manifest, nodes, profile);
    return { ...build_graph(nodes, profile), manifest };
}
