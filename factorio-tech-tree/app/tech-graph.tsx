"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import GraphCanvas from "./components/tech-graph/graph-canvas";
import GraphDetails from "./components/tech-graph/graph-details";
import type { GraphEdge, GraphNode } from "./lib/tech-tree/types";
import { build_layout } from "./lib/tech-graph/graph-layout";
import { max_zoom, min_zoom, node_width, science_pack_name_map } from "./lib/tech-graph/constants";
import type { GraphEdgePath, GraphSelection, Transform } from "./lib/tech-graph/types";
import { clamp } from "./lib/tech-graph/utils";

type GraphViewProps = {
    nodes: GraphNode[];
    edges: GraphEdge[];
    root_ids: string[];
};

const misc_filter_id = "misc";
const science_filter_options = Object.entries(science_pack_name_map).map(
    ([name, internal_name]) => ({
        id: internal_name,
        label: name,
        icon_path: `data/tech_images/${internal_name}.png`,
    }),
);
const all_filter_ids = new Set([
    ...science_filter_options.map((filter) => filter.id),
    misc_filter_id,
]);

export default function TechGraph({ nodes, edges, root_ids }: GraphViewProps) {
    const container_ref = useRef<HTMLDivElement | null>(null);
    const [transform, set_transform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
    const [is_panning, set_is_panning] = useState(false);
    const pointer_ref = useRef<{ x: number; y: number } | null>(null);
    const dragged_ref = useRef(false);
    const focus_animation_ref = useRef<number | null>(null);
    const transform_ref = useRef<Transform>(transform);
    const history_ref = useRef<{ stack: string[]; index: number }>({
        stack: [],
        index: -1,
    });
    const [selected_node_id, set_selected_node_id] = useState<string | null>(
        null,
    );
    const [active_filters, set_active_filters] = useState<Set<string>>(
        () => new Set(all_filter_ids),
    );
    const [search_query, set_search_query] = useState("");

    const root_set = useMemo(() => new Set(root_ids), [root_ids]);
    const nodes_by_id = useMemo(
        () => new Map(nodes.map((node) => [node.id, node])),
        [nodes],
    );

    const layout = useMemo(() => build_layout(nodes), [nodes]);

    const edges_with_paths = useMemo<GraphEdgePath[]>(() => {
        return edges
            .map((edge) => {
                const from_pos = layout.positions[edge.from];
                const to_pos = layout.positions[edge.to];
                const from_size = layout.sizes[edge.from];
                const to_size = layout.sizes[edge.to];
                if (!from_pos || !to_pos) {
                    return null;
                }
                if (edge.from === edge.to) {
                    return null;
                }

                const start_x = from_pos.x + (from_size?.width ?? node_width) / 2;
                const start_y = from_pos.y + (from_size?.height ?? 0);
                const end_x = to_pos.x + (to_size?.width ?? node_width) / 2;
                const end_y = to_pos.y;
                const mid_y = start_y + (end_y - start_y) * 0.55;
                const path = `M ${start_x} ${start_y} C ${start_x} ${mid_y}, ${end_x} ${mid_y}, ${end_x} ${end_y}`;
                return { ...edge, path };
            })
            .filter((edge): edge is GraphEdgePath => edge !== null);
    }, [edges, layout]);

    const selection_index = useMemo(() => {
        const incoming_edges = new Map<string, GraphEdge[]>();
        const outgoing_edges = new Map<string, GraphEdge[]>();

        for (const edge of edges) {
            if (!incoming_edges.has(edge.to)) {
                incoming_edges.set(edge.to, []);
            }
            if (!outgoing_edges.has(edge.from)) {
                outgoing_edges.set(edge.from, []);
            }
            incoming_edges.get(edge.to)?.push(edge);
            outgoing_edges.get(edge.from)?.push(edge);
        }

        const index = new Map<
            string,
            {
                selection: GraphSelection;
                highlighted_edge_ids: Set<string>;
                related_node_ids: Set<string>;
            }
        >();

        for (const node of nodes) {
            const node_id = node.id;
            const incoming = incoming_edges.get(node_id) ?? [];
            const outgoing = outgoing_edges.get(node_id) ?? [];
            const incoming_nodes = incoming
                .map((edge) => nodes_by_id.get(edge.from))
                .filter((entry): entry is GraphNode => Boolean(entry));
            const outgoing_nodes = outgoing
                .map((edge) => nodes_by_id.get(edge.to))
                .filter((entry): entry is GraphNode => Boolean(entry));

            const highlighted_edge_ids = new Set([
                ...incoming.map((edge) => edge.id),
                ...outgoing.map((edge) => edge.id),
            ]);
            const related_node_ids = new Set([
                ...incoming_nodes.map((entry) => entry.id),
                ...outgoing_nodes.map((entry) => entry.id),
                node_id,
            ]);

            index.set(node_id, {
                selection: {
                    mode: "node" as const,
                    incoming_edges: incoming,
                    outgoing_edges: outgoing,
                    incoming_nodes,
                    outgoing_nodes,
                },
                highlighted_edge_ids,
                related_node_ids,
            });
        }

        return index;
    }, [edges, nodes, nodes_by_id]);

    const selected_node = useMemo(() => {
        if (!selected_node_id) {
            return null;
        }
        return nodes_by_id.get(selected_node_id) ?? null;
    }, [nodes_by_id, selected_node_id]);

    const empty_selection = useMemo<GraphSelection>(() => ({ mode: "none" as const }), []);
    const empty_edge_ids = useMemo(() => new Set<string>(), []);
    const empty_related_ids = useMemo(() => new Set<string>(), []);

    const selection_entry = useMemo(() => {
        if (!selected_node_id) {
            return null;
        }
        return selection_index.get(selected_node_id) ?? null;
    }, [selected_node_id, selection_index]);

    const selection = selection_entry?.selection ?? empty_selection;
    const highlighted_edge_ids = selection_entry?.highlighted_edge_ids ?? empty_edge_ids;
    const related_node_ids = selection_entry?.related_node_ids ?? empty_related_ids;

    const filter_match_ids = useMemo(() => {
        const matches = new Set<string>();
        for (const node of nodes) {
            const science_packs = node.research_science?.science_packs ?? [];
            if (node.research_type === "science" && science_packs.length > 0) {
                let is_match = true;
                for (const pack of science_packs) {
                    const internal_name = science_pack_name_map[pack.name];
                    if (!internal_name || !active_filters.has(internal_name)) {
                        is_match = false;
                        break;
                    }
                }
                if (is_match) {
                    matches.add(node.id);
                }
            } else if (active_filters.has(misc_filter_id)) {
                matches.add(node.id);
            }
        }
        return matches;
    }, [active_filters, nodes]);

    const search_matches = useMemo(() => {
        const normalized_query = search_query.trim().toLowerCase();
        if (!normalized_query) {
            return [];
        }
        return nodes.filter((node) => {
            const title = node.title?.toLowerCase() ?? "";
            return (
                node.id.toLowerCase().includes(normalized_query) ||
                title.includes(normalized_query)
            );
        });
    }, [nodes, search_query]);

    const search_match_ids = useMemo(() => {
        if (search_matches.length === 0) {
            return new Set<string>();
        }
        return new Set(search_matches.map((node) => node.id));
    }, [search_matches]);

    const toggle_filter = useCallback((filter_id: string) => {
        set_active_filters((current) => {
            const next = new Set(current);
            if (next.has(filter_id)) {
                next.delete(filter_id);
            } else {
                next.add(filter_id);
            }
            return next;
        });
    }, []);

    const select_all_filters = useCallback(() => {
        set_active_filters(new Set(all_filter_ids));
    }, []);

    const deselect_all_filters = useCallback(() => {
        set_active_filters(new Set());
    }, []);

    useEffect(() => {
        transform_ref.current = transform;
    }, [transform]);

    const cancel_focus_animation = useCallback(() => {
        if (focus_animation_ref.current === null) {
            return;
        }
        cancelAnimationFrame(focus_animation_ref.current);
        focus_animation_ref.current = null;
    }, []);

    const record_history = useCallback((node_id: string) => {
        const history = history_ref.current;
        const { stack } = history;
        const current_id = stack[history.index];
        if (current_id === node_id) {
            return;
        }
        if (history.index < stack.length - 1) {
            stack.splice(history.index + 1);
        }
        stack.push(node_id);
        if (stack.length > 100) {
            const overflow = stack.length - 100;
            stack.splice(0, overflow);
        }
        history.index = stack.length - 1;
    }, []);

    const select_node = useCallback(
        (node_id: string) => {
            record_history(node_id);
            set_selected_node_id(node_id);
        },
        [record_history],
    );

    const focus_node = useCallback(
        (node_id: string, options?: { record_history?: boolean }) => {
            if (options?.record_history !== false) {
                record_history(node_id);
            }
            set_selected_node_id(node_id);
            const position = layout.positions[node_id];
            const size = layout.sizes[node_id];
            if (!position || !size) {
                return;
            }
            const container = container_ref.current;
            if (!container) {
                return;
            }
            const { width, height } = container.getBoundingClientRect();
            if (width === 0 || height === 0) {
                return;
            }
            const start = transform_ref.current;
            const center_x = position.x + size.width / 2;
            const center_y = position.y + size.height / 2;
            const target_x = width / 2 - center_x * start.scale;
            const target_y = height / 2 - center_y * start.scale;
            cancel_focus_animation();
            const duration_ms = 440;
            const start_time = performance.now();
            const animate = (now: number) => {
                const elapsed = now - start_time;
                const progress = Math.min(1, elapsed / duration_ms);
                const eased = 1 - Math.pow(1 - progress, 3);
                set_transform({
                    scale: start.scale,
                    x: start.x + (target_x - start.x) * eased,
                    y: start.y + (target_y - start.y) * eased,
                });
                if (progress < 1) {
                    focus_animation_ref.current = requestAnimationFrame(animate);
                    return;
                }
                focus_animation_ref.current = null;
            };
            focus_animation_ref.current = requestAnimationFrame(animate);
        },
        [cancel_focus_animation, layout.positions, layout.sizes, record_history],
    );

    const fit_to_view = useCallback(() => {
        const container = container_ref.current;
        if (!container) {
            return;
        }
        const { width, height } = container.getBoundingClientRect();
        if (width === 0 || height === 0) {
            return;
        }

        const scale = clamp(
            Math.min(width / layout.width, height / layout.height, 1),
            min_zoom,
            max_zoom,
        );
        const x = (width - layout.width * scale) / 2;
        const y = (height - layout.height * scale) / 2;

        cancel_focus_animation();
        set_transform({ x, y, scale });
    }, [cancel_focus_animation, layout.height, layout.width]);

    useEffect(() => {
        fit_to_view();
        window.addEventListener("resize", fit_to_view);
        return () => {
            window.removeEventListener("resize", fit_to_view);
        };
    }, [fit_to_view]);

    const navigate_history = useCallback(
        (direction: "back" | "forward") => {
            const history = history_ref.current;
            const next_index = direction === "back" ? history.index - 1 : history.index + 1;
            if (next_index < 0 || next_index >= history.stack.length) {
                return;
            }
            history.index = next_index;
            const node_id = history.stack[next_index];
            focus_node(node_id, { record_history: false });
        },
        [focus_node],
    );

    useEffect(() => {
        const is_typing_target = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) {
                return false;
            }
            if (target.isContentEditable) {
                return true;
            }
            return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
        };

        const on_key_down = (event: KeyboardEvent) => {
            if (event.defaultPrevented || is_typing_target(event.target)) {
                return;
            }
            if (event.key === "Backspace") {
                event.preventDefault();
                navigate_history("back");
                return;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                navigate_history("forward");
            }
        };

        window.addEventListener("keydown", on_key_down);
        return () => {
            window.removeEventListener("keydown", on_key_down);
        };
    }, [navigate_history]);

    const update_zoom = useCallback(
        (next_scale: number, anchor_x?: number, anchor_y?: number) => {
            const container = container_ref.current;
            if (!container) {
                return;
            }
            cancel_focus_animation();
            const rect = container.getBoundingClientRect();
            const anchor = {
                x: anchor_x ?? rect.width / 2,
                y: anchor_y ?? rect.height / 2,
            };
            set_transform((current) => {
                const scale = clamp(next_scale, min_zoom, max_zoom);
                const ratio = scale / current.scale;
                return {
                    scale,
                    x: anchor.x - (anchor.x - current.x) * ratio,
                    y: anchor.y - (anchor.y - current.y) * ratio,
                };
            });
        },
        [cancel_focus_animation],
    );

    const on_wheel = useCallback(
        (event: React.WheelEvent<HTMLElement>) => {
            const target = event.target as HTMLElement;
            if (target.closest("[data-no-zoom]")) {
                return;
            }
            event.preventDefault();
            const container = container_ref.current;
            if (!container) {
                return;
            }
            const zoom_factor = event.deltaY < 0 ? 1.08 : 0.92;
            const rect = container.getBoundingClientRect();
            const anchor_x = clamp(event.clientX - rect.left, 0, rect.width);
            const anchor_y = clamp(event.clientY - rect.top, 0, rect.height);
            update_zoom(
                transform.scale * zoom_factor,
                anchor_x,
                anchor_y,
            );
        },
        [transform.scale, update_zoom],
    );

    const on_pointer_down = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (event.button !== 0) {
                return;
            }
            const target = event.target as HTMLElement;
            if (target.closest("[data-no-pan]")) {
                return;
            }
            cancel_focus_animation();
            event.currentTarget.setPointerCapture(event.pointerId);
            pointer_ref.current = { x: event.clientX, y: event.clientY };
            dragged_ref.current = false;
            set_is_panning(true);
        },
        [cancel_focus_animation],
    );

    const on_pointer_move = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (!pointer_ref.current) {
                return;
            }
            const dx = event.clientX - pointer_ref.current.x;
            const dy = event.clientY - pointer_ref.current.y;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                dragged_ref.current = true;
            }
            pointer_ref.current = { x: event.clientX, y: event.clientY };
            set_transform((current) => ({
                ...current,
                x: current.x + dx,
                y: current.y + dy,
            }));
        },
        [],
    );

    const on_pointer_up = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!pointer_ref.current) {
            return;
        }
        event.currentTarget.releasePointerCapture(event.pointerId);
        pointer_ref.current = null;
        set_is_panning(false);
    }, []);

    const on_canvas_click = useCallback(() => {
        if (dragged_ref.current) {
            dragged_ref.current = false;
            return;
        }
        set_selected_node_id(null);
    }, []);

    return (
        <section className="graph-shell" onWheel={on_wheel}>
            <GraphCanvas
                container_ref={container_ref}
                is_panning={is_panning}
                layout={layout}
                transform={transform}
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
                on_canvas_click={on_canvas_click}
                on_zoom_in={() => update_zoom(transform.scale * 1.12)}
                on_zoom_out={() => update_zoom(transform.scale * 0.88)}
                on_reset={fit_to_view}
                on_select_node={select_node}
                on_focus_node={focus_node}
            />
            <GraphDetails
                selection={selection}
                selected_node={selected_node}
                on_focus_node={focus_node}
            />
        </section>
    );
}
