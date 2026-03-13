import type { GraphNode } from "../tech-tree/types";
import { canvas_padding, node_gap_x, node_gap_y, node_width } from "./constants";
import { get_node_height } from "./utils";

export type LayoutDirection = "vertical" | "horizontal";

export type Layout = {
    width: number;
    height: number;
    positions: Record<string, { x: number; y: number }>;
    sizes: Record<string, { width: number; height: number }>;
};

export function build_layout(nodes: GraphNode[], direction: LayoutDirection = "vertical"): Layout {
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

    const normalize_title = (title: string) => title.normalize("NFKD").toLowerCase();

    for (const level_nodes of nodes_by_level.values()) {
        level_nodes.sort((a, b) => {
            const title_a = normalize_title(a.title);
            const title_b = normalize_title(b.title);
            if (title_a < title_b) {
                return -1;
            }
            if (title_a > title_b) {
                return 1;
            }
            if (a.id < b.id) {
                return -1;
            }
            if (a.id > b.id) {
                return 1;
            }
            return 0;
        });
    }

    const total_levels = max_level + 1;

    // Compute max node height per level; apply uniformly so all nodes in a level share height.
    const level_heights = new Map<number, number>();
    for (const [level, level_nodes] of nodes_by_level.entries()) {
        const row_height = Math.max(
            0,
            ...level_nodes.map((node) => sizes[node.id]?.height ?? 0),
        );
        level_heights.set(level, row_height);
    }
    for (const [level, level_nodes] of nodes_by_level.entries()) {
        const row_height = level_heights.get(level) ?? 0;
        for (const node of level_nodes) {
            sizes[node.id] = { width: node_width, height: row_height };
        }
    }

    if (direction === "horizontal") {
        // Levels arranged left-to-right; nodes within a level stacked top-to-bottom.
        // node_gap_y reused as the gap between level columns; node_gap_x as vertical node gap.
        const width =
            canvas_padding * 2 +
            total_levels * node_width +
            Math.max(0, total_levels - 1) * node_gap_y;

        let max_column_height = 0;
        for (const [level, level_nodes] of nodes_by_level.entries()) {
            const row_height = level_heights.get(level) ?? 0;
            const count = level_nodes.length;
            const col_height = count * row_height + Math.max(0, count - 1) * node_gap_x;
            max_column_height = Math.max(max_column_height, col_height);
        }
        const height = canvas_padding * 2 + max_column_height;

        const positions: Record<string, { x: number; y: number }> = {};
        for (let level = 0; level <= max_level; level += 1) {
            const level_nodes = nodes_by_level.get(level) ?? [];
            const row_height = level_heights.get(level) ?? 0;
            const count = level_nodes.length;
            const col_height = count * row_height + Math.max(0, count - 1) * node_gap_x;

            const col_x = canvas_padding + level * (node_width + node_gap_y);
            const offset_y = canvas_padding + Math.max(0, (max_column_height - col_height) / 2);

            for (const [index, node] of level_nodes.entries()) {
                positions[node.id] = {
                    x: col_x,
                    y: offset_y + index * (row_height + node_gap_x),
                };
            }
        }

        return { width, height, positions, sizes };
    }

    // Vertical layout: levels arranged top-to-bottom; nodes within a level left-to-right.
    const max_nodes_per_level = Math.max(
        1,
        ...Array.from(nodes_by_level.values()).map((level) => level.length),
    );

    const width =
        max_nodes_per_level * node_width +
        (max_nodes_per_level - 1) * node_gap_x +
        canvas_padding * 2;
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
