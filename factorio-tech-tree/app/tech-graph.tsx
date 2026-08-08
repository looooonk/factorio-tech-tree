"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import GraphCanvas from "./components/tech-graph/graph-canvas";
import GraphDetails from "./components/tech-graph/graph-details";
import type { GraphEdge, GraphNode } from "./lib/tech-tree/types";
import { build_layout } from "./lib/tech-graph/graph-layout";
import { node_width, science_pack_name_map } from "./lib/tech-graph/constants";
import type { GraphEdgePath, GraphSelection } from "./lib/tech-graph/types";
import { use_pan_zoom } from "./hooks/use_pan_zoom";
import { use_history_navigation } from "./hooks/use_history_navigation";
import { use_filter_state } from "./hooks/use_filter_state";

// --- Module-level constants ---

const misc_filter_id = "misc";

const science_filter_options = Object.entries(science_pack_name_map).map(
    ([name, internal_name]) => ({
        id: internal_name,
        label: name,
        icon_path: `/data/tech_images/${internal_name}.png`,
    }),
);

const all_filter_ids = new Set([
    ...science_filter_options.map((f) => f.id),
    misc_filter_id,
]);

// --- Types ---

type GraphViewProps = {
    nodes: GraphNode[];
    edges: GraphEdge[];
    root_ids: string[];
};

// --- Helper: build edge adjacency index ---

type EdgeIndex = {
    incoming: Map<string, GraphEdge[]>;
    outgoing: Map<string, GraphEdge[]>;
};

/** Builds maps from node ID to its incoming and outgoing edges in one pass. */
function build_edge_index(edges: GraphEdge[]): EdgeIndex {
    const incoming = new Map<string, GraphEdge[]>();
    const outgoing = new Map<string, GraphEdge[]>();
    for (const edge of edges) {
        if (!incoming.has(edge.to)) incoming.set(edge.to, []);
        if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
        incoming.get(edge.to)!.push(edge);
        outgoing.get(edge.from)!.push(edge);
    }
    return { incoming, outgoing };
}

// --- Component ---

export default function TechGraph({ nodes, edges, root_ids }: GraphViewProps) {
    const container_ref = useRef<HTMLDivElement | null>(null);
    const [selected_node_id, set_selected_node_id] = useState<string | null>(null);

    // --- Derived data ---

    const root_set = useMemo(() => new Set(root_ids), [root_ids]);

    const nodes_by_id = useMemo(
        () => new Map(nodes.map((node) => [node.id, node])),
        [nodes],
    );

    const layout = useMemo(() => build_layout(nodes), [nodes]);

    const get_layout_size = useCallback(
        () => ({ width: layout.width, height: layout.height }),
        [layout.width, layout.height],
    );

    // --- Hooks ---

    const {
        active_filters,
        toggle_filter,
        select_all_filters,
        deselect_all_filters,
        search_query,
        set_search_query,
        depth_mode,
        set_depth_mode,
    } = use_filter_state(all_filter_ids);

    const {
        viewport_ref,
        fit_to_view,
        on_zoom_in,
        on_zoom_out,
        animate_to,
        on_pointer_down,
        on_pointer_move,
        on_pointer_up,
    } = use_pan_zoom({
        container_ref,
        get_layout_size,
        on_canvas_click: () => set_selected_node_id(null),
    });

    // --- Navigation ---

    // focus_node_ref breaks the circular dependency between focus_node and
    // use_history_navigation: the hook's on_navigate callback reads from this
    // ref, so it doesn't need focus_node in its closure at declaration time.
    const focus_node_ref = useRef<((node_id: string, opts?: { record_history?: boolean }) => void) | null>(null);

    const { record_history } = use_history_navigation({
        on_navigate: (node_id) => focus_node_ref.current?.(node_id, { record_history: false }),
    });

    const focus_node = useCallback(
        (node_id: string, options?: { record_history?: boolean }) => {
            if (options?.record_history !== false) {
                record_history(node_id);
            }
            set_selected_node_id(node_id);
            const position = layout.positions[node_id];
            const size = layout.sizes[node_id];
            if (!position || !size) return;
            animate_to(position.x + size.width / 2, position.y + size.height / 2);
        },
        [animate_to, layout.positions, layout.sizes, record_history],
    );

    useEffect(() => {
        focus_node_ref.current = focus_node;
    }, [focus_node]);

    const select_node = useCallback(
        (node_id: string) => {
            record_history(node_id);
            set_selected_node_id(node_id);
        },
        [record_history],
    );

    // --- Edge paths ---

    const edges_with_paths = useMemo<GraphEdgePath[]>(() => {
        return edges
            .map((edge) => {
                if (edge.from === edge.to) return null;
                const from_pos = layout.positions[edge.from];
                const to_pos = layout.positions[edge.to];
                if (!from_pos || !to_pos) return null;
                const from_size = layout.sizes[edge.from];
                const to_size = layout.sizes[edge.to];
                const start_x = from_pos.x + (from_size?.width ?? node_width) / 2;
                const start_y = from_pos.y + (from_size?.height ?? 0);
                const end_x = to_pos.x + (to_size?.width ?? node_width) / 2;
                const end_y = to_pos.y;
                // Control point at 55% of the vertical span keeps the curve
                // visually weighted toward the source node.
                const mid_y = start_y + (end_y - start_y) * 0.55;
                const path = `M ${start_x} ${start_y} C ${start_x} ${mid_y}, ${end_x} ${mid_y}, ${end_x} ${end_y}`;
                return { ...edge, path };
            })
            .filter((edge): edge is GraphEdgePath => edge !== null);
    }, [edges, layout]);

    // --- Selection index (direct neighbours) ---

    /**
     * Pre-builds per-node selection data (direct neighbours only) so that
     * selecting a node is O(1) rather than O(edges).
     */
    const selection_index = useMemo(() => {
        const { incoming, outgoing } = build_edge_index(edges);

        return new Map(
            nodes.map((node) => {
                const node_id = node.id;
                const inc = incoming.get(node_id) ?? [];
                const out = outgoing.get(node_id) ?? [];
                const incoming_nodes = inc
                    .map((e) => nodes_by_id.get(e.from))
                    .filter((n): n is GraphNode => n !== undefined);
                const outgoing_nodes = out
                    .map((e) => nodes_by_id.get(e.to))
                    .filter((n): n is GraphNode => n !== undefined);

                return [
                    node_id,
                    {
                        selection: {
                            mode: "node" as const,
                            incoming_edges: inc,
                            outgoing_edges: out,
                            incoming_nodes,
                            outgoing_nodes,
                        } satisfies GraphSelection,
                        highlighted_edge_ids: new Set([
                            ...inc.map((e) => e.id),
                            ...out.map((e) => e.id),
                        ]),
                        related_node_ids: new Set([
                            ...incoming_nodes.map((n) => n.id),
                            ...outgoing_nodes.map((n) => n.id),
                            node_id,
                        ]),
                    },
                ];
            }),
        );
    }, [edges, nodes, nodes_by_id]);

    // --- Ancestor index (all transitive prerequisites) ---

    /**
     * Pre-computes the full ancestor subgraph for every node via BFS so that
     * switching to "ancestors" depth mode is also O(1) at interaction time.
     */
    const ancestors_index = useMemo(() => {
        const { incoming } = build_edge_index(edges);

        return new Map(
            nodes.map((node) => {
                // Phase 1: collect all ancestor node IDs via BFS.
                const ancestor_node_ids = new Set<string>();
                const visited = new Set<string>([node.id]);
                const queue: string[] = [node.id];
                while (queue.length > 0) {
                    const current_id = queue.shift()!;
                    for (const edge of incoming.get(current_id) ?? []) {
                        if (!visited.has(edge.from)) {
                            visited.add(edge.from);
                            ancestor_node_ids.add(edge.from);
                            queue.push(edge.from);
                        }
                    }
                }
                // Phase 2: collect every edge whose both endpoints are within the
                // ancestor subgraph. A simple BFS would miss edges where one endpoint
                // was already visited via a different path.
                const relevant = new Set([...ancestor_node_ids, node.id]);
                const ancestor_edge_ids = new Set(
                    edges
                        .filter((e) => relevant.has(e.from) && relevant.has(e.to))
                        .map((e) => e.id),
                );

                return [node.id, { node_ids: ancestor_node_ids, edge_ids: ancestor_edge_ids }];
            }),
        );
    }, [edges, nodes]);

    // --- Resolved selection state ---

    const selected_node = useMemo(
        () => (selected_node_id ? (nodes_by_id.get(selected_node_id) ?? null) : null),
        [nodes_by_id, selected_node_id],
    );

    const selection_entry = selected_node_id
        ? (selection_index.get(selected_node_id) ?? null)
        : null;

    const empty_selection = useMemo<GraphSelection>(() => ({ mode: "none" as const }), []);
    const selection = selection_entry?.selection ?? empty_selection;

    /**
     * Merges direct-neighbour highlights with full-ancestor highlights depending
     * on depth_mode. Returns an empty set when nothing is selected.
     */
    const highlighted_edge_ids = useMemo(() => {
        if (!selected_node_id || !selection_entry) return new Set<string>();
        const base = selection_entry.highlighted_edge_ids;
        if (depth_mode === "direct") return base;
        const ancestors = ancestors_index.get(selected_node_id);
        return ancestors ? new Set([...base, ...ancestors.edge_ids]) : base;
    }, [ancestors_index, depth_mode, selected_node_id, selection_entry]);

    const related_node_ids = useMemo(() => {
        if (!selected_node_id || !selection_entry) return new Set<string>();
        const base = selection_entry.related_node_ids;
        if (depth_mode === "direct") return base;
        const ancestors = ancestors_index.get(selected_node_id);
        return ancestors ? new Set([...base, ...ancestors.node_ids]) : base;
    }, [ancestors_index, depth_mode, selected_node_id, selection_entry]);

    // --- Filter matching ---

    /**
     * A node passes the filter if every science pack it requires is in
     * `active_filters`. Non-science nodes pass only if the misc filter is on.
     */
    const filter_match_ids = useMemo(() => {
        const matches = new Set<string>();
        for (const node of nodes) {
            const science_packs = node.research_science?.science_packs ?? [];
            if (node.research_type === "science" && science_packs.length > 0) {
                const all_packs_active = science_packs.every((pack) => {
                    const internal = science_pack_name_map[pack.name];
                    return internal && active_filters.has(internal);
                });
                if (all_packs_active) matches.add(node.id);
            } else if (active_filters.has(misc_filter_id)) {
                matches.add(node.id);
            }
        }
        return matches;
    }, [active_filters, nodes]);

    // --- Search ---

    const search_matches = useMemo(() => {
        const normalized = search_query.trim().toLowerCase();
        if (!normalized) return [];
        return nodes.filter((node) => {
            const title = node.title?.toLowerCase() ?? "";
            return node.id.toLowerCase().includes(normalized) || title.includes(normalized);
        });
    }, [nodes, search_query]);

    const search_match_ids = useMemo(
        () => new Set(search_matches.map((n) => n.id)),
        [search_matches],
    );

    // --- Render ---

    return (
        <section className="graph-shell">
            <GraphCanvas
                container_ref={container_ref}
                viewport_ref={viewport_ref}
                layout={layout}
                edges={edges_with_paths}
                nodes={nodes}
                root_set={root_set}
                selected_node_id={selected_node_id}
                related_node_ids={related_node_ids}
                filter_match_ids={filter_match_ids}
                search_match_ids={search_match_ids}
                search_query={search_query}
                search_matches={search_matches}
                on_search_query_change={set_search_query}
                science_filters={science_filter_options}
                active_filters={active_filters}
                on_toggle_filter={toggle_filter}
                on_select_all_filters={select_all_filters}
                on_deselect_all_filters={deselect_all_filters}
                highlighted_edge_ids={highlighted_edge_ids}
                on_pointer_down={on_pointer_down}
                on_pointer_move={on_pointer_move}
                on_pointer_up={on_pointer_up}
                on_zoom_in={on_zoom_in}
                on_zoom_out={on_zoom_out}
                on_reset={fit_to_view}
                on_select_node={select_node}
                on_focus_node={focus_node}
                depth_mode={depth_mode}
                on_change_depth_mode={set_depth_mode}
            />
            <GraphDetails
                selection={selection}
                selected_node={selected_node}
                on_focus_node={focus_node}
            />
        </section>
    );
}
