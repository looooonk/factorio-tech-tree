import type { GraphNode } from "../tech-tree/types";
import { canvas_padding, node_gap_x, node_gap_y, node_width } from "./constants";
import { get_node_height } from "./utils";

export type Layout = {
    width: number;
    height: number;
    positions: Record<string, { x: number; y: number }>;
    sizes: Record<string, { width: number; height: number }>;
};

export function build_layout(nodes: GraphNode[]): Layout {
    const nodes_by_level = new Map<number, GraphNode[]>();
    let max_level = 0;
    const sizes: Record<string, { width: number; height: number }> = {};

    for (const node of nodes) {
        const level_nodes = nodes_by_level.get(node.level) ?? [];
        level_nodes.push(node);
        nodes_by_level.set(node.level, level_nodes);
        max_level = Math.max(max_level, node.level);
        sizes[node.id] = { width: node_width, height: get_node_height(node) };
    }

    const title_collator = new Intl.Collator("en");

    for (const level_nodes of nodes_by_level.values()) {
        level_nodes.sort((a, b) => title_collator.compare(a.title, b.title));
    }

    const max_nodes_per_level = Math.max(
        1,
        ...Array.from(nodes_by_level.values()).map((level) => level.length),
    );

    const width =
        max_nodes_per_level * node_width +
        (max_nodes_per_level - 1) * node_gap_x +
        canvas_padding * 2;
    const level_heights = new Map<number, number>();
    for (const [level, level_nodes] of nodes_by_level.entries()) {
        const row_height = Math.max(
            0,
            ...level_nodes.map((node) => sizes[node.id]?.height ?? 0),
        );
        level_heights.set(level, row_height);
    }

    const total_levels = max_level + 1;
    const height =
        canvas_padding * 2 +
        Array.from({ length: total_levels }, (_, index) => level_heights.get(index) ?? 0)
            .reduce((sum, value) => sum + value, 0) +
        Math.max(0, total_levels - 1) * node_gap_y;

    const positions: Record<string, { x: number; y: number }> = {};
    let current_y = canvas_padding;

    for (let level = 0; level <= max_level; level += 1) {
        const level_nodes = nodes_by_level.get(level) ?? [];
        const row_width =
            level_nodes.length * node_width +
            Math.max(0, level_nodes.length - 1) * node_gap_x;
        const offset_x =
            canvas_padding + Math.max(0, (width - canvas_padding * 2 - row_width) / 2);

        for (const [index, node] of level_nodes.entries()) {
            positions[node.id] = {
                x: offset_x + index * (node_width + node_gap_x),
                y: current_y,
            };
        }

        current_y += (level_heights.get(level) ?? 0) + node_gap_y;
    }

    return { width, height, positions, sizes };
}
