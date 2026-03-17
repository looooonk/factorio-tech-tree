import type { GraphNode } from "../tech-tree/types";
import { canvas_padding, node_gap_x, node_gap_y, node_width } from "./constants";
import { get_node_height } from "./utils";

export type LayoutDirection = "vertical" | "horizontal";

export type GroupColumn = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type Layout = {
    width: number;
    height: number;
    positions: Record<string, { x: number; y: number }>;
    sizes: Record<string, { width: number; height: number }>;
    group_columns: GroupColumn[];
};

/**
 * Detects nodes belonging to a sequential infinite research group.
 *
 * A group consists of nodes whose IDs match `(base)_1`, `(base)_2`, ..., `(base)_N` or
 * `(base)_N-inf`, where a `(base)_1` member must exist in the node set.
 *
 * Returns a map from node_id to its group base name.
 */
function detect_group_membership(nodes: GraphNode[]): Map<string, string> {
    const pattern = /^(.+)_(\d+(?:-inf)?)$/;
    const id_set = new Set(nodes.map((n) => n.id));
    const candidates = new Map<string, string[]>();

    for (const node of nodes) {
        const m = pattern.exec(node.id);
        if (!m) continue;
        const base = m[1];
        const bucket = candidates.get(base);
        if (bucket) bucket.push(node.id);
        else candidates.set(base, [node.id]);
    }

    const result = new Map<string, string>();
    for (const [base, ids] of candidates) {
        if (ids.some((id) => id === `${base}_1`)) {
            for (const id of ids) {
                if (id_set.has(id)) result.set(id, base);
            }
        }
    }
    return result;
}

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
    const title_sort = (a: GraphNode, b: GraphNode) => {
        const ta = normalize_title(a.title);
        const tb = normalize_title(b.title);
        if (ta < tb) return -1;
        if (ta > tb) return 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    };

    for (const level_nodes of nodes_by_level.values()) {
        level_nodes.sort(title_sort);
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

        return { width, height, positions, sizes, group_columns: [] };
    }

    // Vertical layout: levels top-to-bottom; infinite research groups in side lanes flanking trunk.
    const group_membership = detect_group_membership(nodes);
    // Groups with 2 or fewer members are merged back into the trunk.
    const group_sizes = new Map<string, number>();
    for (const base of group_membership.values()) {
        group_sizes.set(base, (group_sizes.get(base) ?? 0) + 1);
    }
    for (const [id, base] of group_membership) {
        if ((group_sizes.get(base) ?? 0) <= 2) group_membership.delete(id);
    }
    const trunk_nodes = nodes.filter((n) => !group_membership.has(n.id));
    const group_nodes = nodes.filter((n) => group_membership.has(n.id));

    // Sort group bases alphabetically and assign alternating left/right lanes (0=innermost).
    const group_bases = Array.from(new Set(group_membership.values())).sort();
    const left_group_lanes: string[] = [];
    const right_group_lanes: string[] = [];
    for (let i = 0; i < group_bases.length; i++) {
        if (i % 2 === 0) left_group_lanes.push(group_bases[i]);
        else right_group_lanes.push(group_bases[i]);
    }

    const group_to_lane = new Map<string, { side: "left" | "right"; lane_index: number }>();
    for (let i = 0; i < left_group_lanes.length; i++) {
        group_to_lane.set(left_group_lanes[i], { side: "left", lane_index: i });
    }
    for (let i = 0; i < right_group_lanes.length; i++) {
        group_to_lane.set(right_group_lanes[i], { side: "right", lane_index: i });
    }

    // Build and sort trunk_nodes_by_level for trunk positioning.
    const trunk_nodes_by_level = new Map<number, GraphNode[]>();
    for (const node of trunk_nodes) {
        const level_nodes = trunk_nodes_by_level.get(node.level) ?? [];
        level_nodes.push(node);
        trunk_nodes_by_level.set(node.level, level_nodes);
    }
    for (const level_nodes of trunk_nodes_by_level.values()) {
        level_nodes.sort(title_sort);
    }

    const max_trunk_nodes_per_level = Math.max(
        1,
        ...Array.from(trunk_nodes_by_level.values()).map((l) => l.length),
    );
    const trunk_zone_width =
        max_trunk_nodes_per_level * node_width +
        Math.max(0, max_trunk_nodes_per_level - 1) * node_gap_x;

    // Each lane occupies node_width + node_gap_x (gap serves as inter-lane spacing).
    // Left lanes are ordered outer-to-inner from canvas edge to trunk (lane 0 = innermost).
    // Right lanes are ordered inner-to-outer from trunk to canvas edge (lane 0 = innermost).
    // trunk_side_gap is the gap between the trunk zone and the nearest side lane on each side.
    const num_left = left_group_lanes.length;
    const num_right = right_group_lanes.length;
    const trunk_side_gap = node_gap_x * 4;
    // Horizontal padding inside each column background rect (between node edge and rect edge).
    const col_padding_x = 20;
    // Gap between adjacent side-lane node edges. Chosen so the resulting background-to-background
    // gap (lane_col_gap - 2*col_padding_x) is ~1.5x the normal node_gap_x.
    const lane_col_gap = Math.round(node_gap_x * 1.5) + 2 * col_padding_x; // 160
    const lane_stride = node_width + lane_col_gap; // 460

    const left_zone_width =
        num_left > 0
            ? trunk_side_gap + num_left * node_width + Math.max(0, num_left - 1) * lane_col_gap
            : 0;
    const right_zone_width =
        num_right > 0
            ? trunk_side_gap + num_right * node_width + Math.max(0, num_right - 1) * lane_col_gap
            : 0;

    const trunk_left_x = canvas_padding + left_zone_width;
    const trunk_right_x = trunk_left_x + trunk_zone_width;

    const width = canvas_padding * 2 + left_zone_width + trunk_zone_width + right_zone_width;

    const height =
        canvas_padding * 2 +
        Array.from({ length: total_levels }, (_, i) => level_heights.get(i) ?? 0).reduce(
            (sum, v) => sum + v,
            0,
        ) +
        Math.max(0, total_levels - 1) * node_gap_y;

    // Level y positions are shared by trunk and all group lanes.
    const level_y = new Map<number, number>();
    let current_y = canvas_padding;
    for (let level = 0; level <= max_level; level++) {
        level_y.set(level, current_y);
        current_y += (level_heights.get(level) ?? 0) + node_gap_y;
    }

    const positions: Record<string, { x: number; y: number }> = {};

    // Trunk nodes: centered within the trunk zone at each level.
    for (let level = 0; level <= max_level; level++) {
        const level_nodes = trunk_nodes_by_level.get(level) ?? [];
        const row_width =
            level_nodes.length * node_width +
            Math.max(0, level_nodes.length - 1) * node_gap_x;
        const offset_x = trunk_left_x + Math.max(0, (trunk_zone_width - row_width) / 2);
        const y = level_y.get(level) ?? 0;
        for (const [index, node] of level_nodes.entries()) {
            positions[node.id] = {
                x: offset_x + index * (node_width + node_gap_x),
                y,
            };
        }
    }

    // Group nodes: each group occupies a fixed side lane column at its node's level y.
    // Left lane i:  x = trunk_left_x - trunk_side_gap - node_width - i*lane_stride
    // Right lane i: x = trunk_right_x + trunk_side_gap + i*lane_stride
    for (const node of group_nodes) {
        const base = group_membership.get(node.id)!;
        const lane_info = group_to_lane.get(base)!;
        const y = level_y.get(node.level) ?? 0;
        const x =
            lane_info.side === "left"
                ? trunk_left_x - trunk_side_gap - node_width - lane_info.lane_index * lane_stride
                : trunk_right_x + trunk_side_gap + lane_info.lane_index * lane_stride;
        positions[node.id] = { x, y };
    }

    // Compute bounding boxes for each group column to render background highlights.
    const col_padding = 32;
    const group_extents = new Map<string, { x: number; top: number; bottom: number }>();
    for (const node of group_nodes) {
        const base = group_membership.get(node.id)!;
        const pos = positions[node.id];
        const size = sizes[node.id];
        if (!pos || !size) continue;
        const ext = group_extents.get(base);
        if (ext) {
            ext.top = Math.min(ext.top, pos.y);
            ext.bottom = Math.max(ext.bottom, pos.y + size.height);
        } else {
            group_extents.set(base, { x: pos.x, top: pos.y, bottom: pos.y + size.height });
        }
    }
    const group_columns: GroupColumn[] = [];
    for (const { x, top, bottom } of group_extents.values()) {
        group_columns.push({
            x: x - col_padding_x,
            y: top - col_padding,
            width: node_width + 2 * col_padding_x,
            height: bottom - top + col_padding * 2,
        });
    }

    return { width, height, positions, sizes, group_columns };
}
