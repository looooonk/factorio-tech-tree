import type { GraphNode } from "../tech-tree/types";
import { canvas_padding, node_gap_x, node_gap_y, node_width } from "./constants";
import { get_node_height } from "./utils";

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

// --- Group detection ---

/**
 * Detects nodes belonging to a sequential infinite research group.
 *
 * A group consists of nodes whose IDs match `(base)_1`, `(base)_2`, ...,
 * `(base)_N` or `(base)_N-inf`, where a `(base)_1` member must exist in the
 * node set. Groups with 2 or fewer members are excluded (merged back into the
 * trunk) because they don't warrant a dedicated side lane.
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
        if (!ids.some((id) => id === `${base}_1`)) continue;
        for (const id of ids) {
            if (id_set.has(id)) result.set(id, base);
        }
    }

    // Exclude small groups: a solo or pair of infinite-research nodes isn't
    // worth a dedicated side lane and would clutter the layout.
    const group_sizes = new Map<string, number>();
    for (const base of result.values()) {
        group_sizes.set(base, (group_sizes.get(base) ?? 0) + 1);
    }
    for (const [id, base] of result) {
        if ((group_sizes.get(base) ?? 0) <= 2) result.delete(id);
    }

    return result;
}

// --- Layout ---

export function build_layout(nodes: GraphNode[]): Layout {

    // --- Phase 1: node sizes and per-level bucketing ---

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

    // Normalize so NFKD-decomposed unicode compares correctly (e.g. accented letters).
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

    // Uniform row height: all nodes in a level share the height of the tallest
    // node so that bezier edges from one level always land at the same y offset.
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

    // --- Phase 2: trunk / side-lane partitioning ---

    const group_membership = detect_group_membership(nodes);
    const trunk_nodes = nodes.filter((n) => !group_membership.has(n.id));
    const group_nodes = nodes.filter((n) => group_membership.has(n.id));

    // Distribute group bases into alternating left/right lanes, sorted
    // alphabetically so the assignment is deterministic across re-renders.
    // Lane index 0 is the innermost lane (closest to the trunk) on each side.
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

    // --- Phase 3: trunk geometry ---

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

    // --- Phase 4: side-lane geometry ---

    // Each lane occupies node_width + lane_col_gap horizontally.
    // col_padding_x: gap between the node edge and the background rect edge.
    // lane_col_gap: gap between adjacent node edges across lanes (background-to-background
    //   gap = lane_col_gap - 2*col_padding_x ≈ 1.5x node_gap_x).
    // trunk_side_gap: extra breathing room between the trunk zone and the nearest lane.
    const num_left = left_group_lanes.length;
    const num_right = right_group_lanes.length;
    const trunk_side_gap = node_gap_x * 4;
    const col_padding_x = 20;
    const lane_col_gap = Math.round(node_gap_x * 1.5) + 2 * col_padding_x;
    const lane_stride = node_width + lane_col_gap;

    // Left zone spans from the trunk leftward; right zone spans from the trunk rightward.
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

    const total_levels = max_level + 1;
    const width = canvas_padding * 2 + left_zone_width + trunk_zone_width + right_zone_width;
    const height =
        canvas_padding * 2 +
        Array.from({ length: total_levels }, (_, i) => level_heights.get(i) ?? 0).reduce(
            (sum, v) => sum + v,
            0,
        ) +
        Math.max(0, total_levels - 1) * node_gap_y;

    // --- Phase 5: position assignment ---

    // Shared level y positions (trunk and all group lanes use the same row heights).
    const level_y = new Map<number, number>();
    let current_y = canvas_padding;
    for (let level = 0; level <= max_level; level++) {
        level_y.set(level, current_y);
        current_y += (level_heights.get(level) ?? 0) + node_gap_y;
    }

    const positions: Record<string, { x: number; y: number }> = {};

    // Trunk: each level's row is centered within the trunk zone.
    for (let level = 0; level <= max_level; level++) {
        const level_nodes = trunk_nodes_by_level.get(level) ?? [];
        const row_width =
            level_nodes.length * node_width +
            Math.max(0, level_nodes.length - 1) * node_gap_x;
        const offset_x = trunk_left_x + Math.max(0, (trunk_zone_width - row_width) / 2);
        const y = level_y.get(level) ?? 0;
        for (const [index, node] of level_nodes.entries()) {
            positions[node.id] = { x: offset_x + index * (node_width + node_gap_x), y };
        }
    }

    // Side lanes: each group node sits in its assigned column at the row y for its level.
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

    // --- Phase 6: group column bounding boxes ---

    // col_padding: outer vertical padding added above/below the first/last node
    // in a group column to give the background rect visual breathing room.
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
