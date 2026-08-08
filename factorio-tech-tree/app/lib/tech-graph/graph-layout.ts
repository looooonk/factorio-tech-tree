import type { GraphNode } from "../tech-tree/types";
import { canvas_padding, node_gap_x, node_gap_y, node_width } from "./constants";
import { get_node_height } from "./utils";

export type GroupColumn = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type PlanetColumn = GroupColumn & {
    id: string;
    label: string;
};

export type Layout = {
    width: number;
    height: number;
    positions: Record<string, { x: number; y: number }>;
    sizes: Record<string, { width: number; height: number }>;
    group_columns: GroupColumn[];
    planet_columns: PlanetColumn[];
};

const planet_lanes = [
    { id: "fulgora", label: "Fulgora", root_id: "planet_discovery_fulgora" },
    { id: "gleba", label: "Gleba", root_id: "planet_discovery_gleba" },
    { id: "vulcanus", label: "Vulcanus", root_id: "planet_discovery_vulcanus" },
] as const;
const aquilo_root_id = "planet_discovery_aquilo";
const merge_trunk_node_ids = new Set([aquilo_root_id, "lithium_processing"]);

type PlanetLaneId = (typeof planet_lanes)[number]["id"];

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

function assign_planet_lanes(
    nodes: GraphNode[],
    title_sort: (a: GraphNode, b: GraphNode) => number,
): Map<string, PlanetLaneId> {
    const ordered_nodes = [...nodes].sort((a, b) => a.level - b.level || title_sort(a, b));
    const memberships = new Map<string, Set<PlanetLaneId>>();
    const aquilo_descendants = new Set<string>();

    for (const node of ordered_nodes) {
        if (
            node.id === aquilo_root_id ||
            node.prerequisites.some((id) => aquilo_descendants.has(id))
        ) {
            aquilo_descendants.add(node.id);
            continue;
        }

        const membership = new Set<PlanetLaneId>();
        const root_lane = planet_lanes.find((lane) => lane.root_id === node.id);
        if (root_lane) membership.add(root_lane.id);
        for (const prerequisite_id of node.prerequisites) {
            for (const lane_id of memberships.get(prerequisite_id) ?? []) {
                membership.add(lane_id);
            }
        }
        if (membership.size > 0) memberships.set(node.id, membership);
    }

    const assignments = new Map<string, PlanetLaneId>();
    const row_counts = new Map<string, number>();
    const planet_nodes = ordered_nodes.filter((node) => memberships.has(node.id));
    const count_key = (level: number, lane_id: PlanetLaneId) => `${level}:${lane_id}`;

    for (const node of planet_nodes) {
        const membership = memberships.get(node.id)!;
        if (membership.size !== 1) continue;
        const lane_id = membership.values().next().value as PlanetLaneId;
        assignments.set(node.id, lane_id);
        const key = count_key(node.level, lane_id);
        row_counts.set(key, (row_counts.get(key) ?? 0) + 1);
    }

    for (const node of planet_nodes) {
        const membership = memberships.get(node.id)!;
        if (membership.size === 1) continue;
        const lane_id = [...membership].sort((a, b) => {
            const a_connections = node.prerequisites.filter(
                (id) => assignments.get(id) === a,
            ).length;
            const b_connections = node.prerequisites.filter(
                (id) => assignments.get(id) === b,
            ).length;
            if (a_connections !== b_connections) return b_connections - a_connections;

            const count_difference =
                (row_counts.get(count_key(node.level, a)) ?? 0) -
                (row_counts.get(count_key(node.level, b)) ?? 0);
            if (count_difference !== 0) return count_difference;
            return planet_lanes.findIndex((lane) => lane.id === a) -
                planet_lanes.findIndex((lane) => lane.id === b);
        })[0];
        assignments.set(node.id, lane_id);
        const key = count_key(node.level, lane_id);
        row_counts.set(key, (row_counts.get(key) ?? 0) + 1);
    }

    return assignments;
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
    const planet_assignments = assign_planet_lanes(nodes, title_sort);
    const trunk_nodes = nodes.filter((n) => !group_membership.has(n.id));
    const group_nodes = nodes.filter((n) => group_membership.has(n.id));
    const planet_nodes = trunk_nodes.filter((n) => planet_assignments.has(n.id));
    const common_nodes = trunk_nodes.filter((n) => !planet_assignments.has(n.id));

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

    const common_nodes_by_level = new Map<number, GraphNode[]>();
    for (const node of common_nodes) {
        const level_nodes = common_nodes_by_level.get(node.level) ?? [];
        level_nodes.push(node);
        common_nodes_by_level.set(node.level, level_nodes);
    }
    for (const level_nodes of common_nodes_by_level.values()) {
        level_nodes.sort(title_sort);
        const aquilo_index = level_nodes.findIndex((node) => node.id === aquilo_root_id);
        if (aquilo_index >= 0) {
            const [aquilo_node] = level_nodes.splice(aquilo_index, 1);
            level_nodes.splice(Math.floor(level_nodes.length / 2), 0, aquilo_node);
        }
    }

    const planet_nodes_by_lane_and_level = new Map<PlanetLaneId, Map<number, GraphNode[]>>(
        planet_lanes.map((lane) => [lane.id, new Map()]),
    );
    for (const node of planet_nodes) {
        const lane_id = planet_assignments.get(node.id)!;
        const lane_levels = planet_nodes_by_lane_and_level.get(lane_id)!;
        const level_nodes = lane_levels.get(node.level) ?? [];
        level_nodes.push(node);
        lane_levels.set(node.level, level_nodes);
    }
    for (const lane_levels of planet_nodes_by_lane_and_level.values()) {
        for (const level_nodes of lane_levels.values()) level_nodes.sort(title_sort);
    }
    const active_planet_lanes = planet_lanes.filter(
        (lane) => planet_nodes_by_lane_and_level.get(lane.id)!.size > 0,
    );

    const row_width = (count: number) =>
        count * node_width + Math.max(0, count - 1) * node_gap_x;
    const planet_padding_x = 88;
    const planet_gap_x = node_width + node_gap_x * 2;
    const planet_lane_widths = new Map(
        active_planet_lanes.map((lane) => {
            const lane_levels = planet_nodes_by_lane_and_level.get(lane.id)!;
            const max_width = Math.max(
                0,
                ...[...lane_levels.values()].map((row) => row_width(row.length)),
            );
            return [lane.id, max_width + planet_padding_x * 2] as const;
        }),
    );
    const planet_block_width = active_planet_lanes.reduce(
        (sum, lane) => sum + (planet_lane_widths.get(lane.id) ?? 0),
        Math.max(0, active_planet_lanes.length - 1) * planet_gap_x,
    );
    const planet_levels = planet_nodes.map((node) => node.level);
    const first_planet_level = planet_levels.length > 0 ? Math.min(...planet_levels) : -1;
    const last_planet_level = planet_levels.length > 0 ? Math.max(...planet_levels) : -1;
    const aquilo_level = nodes.find((node) => node.id === aquilo_root_id)?.level ?? Infinity;
    const last_parallel_level = Math.min(last_planet_level, aquilo_level - 1);
    const parallel_common_width = Math.max(
        0,
        ...Array.from(common_nodes_by_level.entries())
            .filter(([level]) => level >= first_planet_level && level <= last_parallel_level)
            .map(([, level_nodes]) => row_width(level_nodes.length)),
    );
    const parallel_gap_x = parallel_common_width > 0 ? node_gap_x * 3 : 0;
    const parallel_strip_width = parallel_common_width + parallel_gap_x;
    const max_common_row_width = Math.max(
        node_width,
        ...[...common_nodes_by_level.values()].map((level_nodes) => row_width(level_nodes.length)),
    );
    const trunk_zone_width = Math.max(
        max_common_row_width,
        planet_block_width + parallel_strip_width * 2,
    );

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
    const planet_block_left_x =
        trunk_left_x + Math.max(0, (trunk_zone_width - planet_block_width) / 2);
    const branch_left_x = planet_block_left_x - parallel_strip_width;
    const planet_lane_left_x = new Map<PlanetLaneId, number>();
    let next_planet_x = planet_block_left_x;
    for (const lane of active_planet_lanes) {
        planet_lane_left_x.set(lane.id, next_planet_x);
        next_planet_x += (planet_lane_widths.get(lane.id) ?? 0) + planet_gap_x;
    }
    const gleba_right_x =
        (planet_lane_left_x.get("gleba") ?? planet_block_left_x) +
        (planet_lane_widths.get("gleba") ?? 0);
    const vulcanus_left_x = planet_lane_left_x.get("vulcanus") ?? gleba_right_x;
    const merge_trunk_x = (gleba_right_x + vulcanus_left_x - node_width) / 2;

    const total_levels = max_level + 1;
    const branch_entry_gap_y = first_planet_level > 0 ? 360 : 0;
    const width = canvas_padding * 2 + left_zone_width + trunk_zone_width + right_zone_width;
    const height =
        canvas_padding * 2 +
        Array.from({ length: total_levels }, (_, i) => level_heights.get(i) ?? 0).reduce(
            (sum, v) => sum + v,
            0,
        ) +
        Math.max(0, total_levels - 1) * node_gap_y +
        branch_entry_gap_y;

    // --- Phase 5: position assignment ---

    // Shared level y positions (trunk and all group lanes use the same row heights).
    const level_y = new Map<number, number>();
    let current_y = canvas_padding;
    for (let level = 0; level <= max_level; level++) {
        level_y.set(level, current_y);
        current_y += (level_heights.get(level) ?? 0) + node_gap_y;
        if (level + 1 === first_planet_level) current_y += branch_entry_gap_y;
    }

    const positions: Record<string, { x: number; y: number }> = {};

    // Common trunk: branch-era nodes use a parallel strip; all other rows stay centered.
    for (let level = 0; level <= max_level; level++) {
        const level_nodes = common_nodes_by_level.get(level) ?? [];
        const level_row_width = row_width(level_nodes.length);
        const is_parallel = level >= first_planet_level && level <= last_parallel_level;
        const offset_x = is_parallel
            ? branch_left_x + Math.max(0, (parallel_common_width - level_row_width) / 2)
            : trunk_left_x + Math.max(0, (trunk_zone_width - level_row_width) / 2);
        const y = level_y.get(level) ?? 0;
        for (const [index, node] of level_nodes.entries()) {
            positions[node.id] = {
                x: merge_trunk_node_ids.has(node.id)
                    ? merge_trunk_x
                    : offset_x + index * (node_width + node_gap_x),
                y,
            };
        }
    }

    for (const lane of active_planet_lanes) {
        const lane_levels = planet_nodes_by_lane_and_level.get(lane.id)!;
        const lane_left_x = planet_lane_left_x.get(lane.id) ?? planet_block_left_x;
        const lane_width = planet_lane_widths.get(lane.id) ?? 0;
        for (const [level, level_nodes] of lane_levels) {
            const level_row_width = row_width(level_nodes.length);
            const centered_offset = Math.max(0, (lane_width - level_row_width) / 2);
            const lane_center_x = lane_left_x + lane_width / 2;
            const planet_center_x = planet_block_left_x + planet_block_width / 2;
            const offset_x =
                level === aquilo_level
                    ? lane_center_x < planet_center_x
                        ? lane_left_x + planet_padding_x
                        : lane_left_x + lane_width - planet_padding_x - level_row_width
                    : lane_left_x + centered_offset;
            const y = level_y.get(level) ?? 0;
            for (const [index, node] of level_nodes.entries()) {
                positions[node.id] = { x: offset_x + index * (node_width + node_gap_x), y };
            }
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

    const planet_padding_top = 220;
    const planet_padding_bottom = 88;
    const planet_columns: PlanetColumn[] = [];
    for (const lane of active_planet_lanes) {
        const lane_nodes = planet_nodes.filter(
            (node) => planet_assignments.get(node.id) === lane.id,
        );
        if (lane_nodes.length === 0) continue;
        const top = Math.min(...lane_nodes.map((node) => positions[node.id].y));
        const bottom = Math.max(
            ...lane_nodes.map((node) => positions[node.id].y + sizes[node.id].height),
        );
        planet_columns.push({
            id: lane.id,
            label: lane.label,
            x: planet_lane_left_x.get(lane.id) ?? 0,
            y: top - planet_padding_top,
            width: planet_lane_widths.get(lane.id) ?? 0,
            height: bottom - top + planet_padding_top + planet_padding_bottom,
        });
    }

    return { width, height, positions, sizes, group_columns, planet_columns };
}
