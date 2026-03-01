"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import GraphCanvas from "./components/tech-graph/graph-canvas";
import GraphDetails from "./components/tech-graph/graph-details";
import type { GraphEdge, GraphNode } from "./lib/tech-tree/types";
import { build_layout } from "./lib/tech-graph/layout";
import { max_zoom, min_zoom, node_width } from "./lib/tech-graph/constants";
import type { GraphEdgePath, GraphSelection, Transform } from "./lib/tech-graph/types";
import { clamp } from "./lib/tech-graph/utils";

type GraphViewProps = {
    nodes: GraphNode[];
    edges: GraphEdge[];
    root_ids: string[];
};

export default function TechGraph({ nodes, edges, root_ids }: GraphViewProps) {
    const container_ref = useRef<HTMLDivElement | null>(null);
    const [transform, set_transform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
    const [is_panning, set_is_panning] = useState(false);
    const pointer_ref = useRef<{ x: number; y: number } | null>(null);
    const dragged_ref = useRef(false);
    const [selected_node_id, set_selected_node_id] = useState<string | null>(
        null,
    );

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

    const selected_node = useMemo(() => {
        if (!selected_node_id) {
            return null;
        }
        return nodes_by_id.get(selected_node_id) ?? null;
    }, [nodes_by_id, selected_node_id]);

    const selection = useMemo<GraphSelection>(() => {
        if (selected_node_id) {
            const incoming_edges = edges.filter((edge) => edge.to === selected_node_id);
            const outgoing_edges = edges.filter((edge) => edge.from === selected_node_id);
            const incoming_nodes = incoming_edges
                .map((edge) => nodes_by_id.get(edge.from))
                .filter((node): node is GraphNode => Boolean(node));
            const outgoing_nodes = outgoing_edges
                .map((edge) => nodes_by_id.get(edge.to))
                .filter((node): node is GraphNode => Boolean(node));

            return {
                mode: "node" as const,
                incoming_edges,
                outgoing_edges,
                incoming_nodes,
                outgoing_nodes,
            };
        }

        return { mode: "none" as const };
    }, [edges, nodes_by_id, selected_node_id]);

    const highlighted_edge_ids = useMemo(() => {
        if (selection.mode === "node") {
            return new Set([
                ...selection.incoming_edges.map((edge) => edge.id),
                ...selection.outgoing_edges.map((edge) => edge.id),
            ]);
        }

        return new Set<string>();
    }, [selection]);

    const related_node_ids = useMemo(() => {
        if (selection.mode === "node") {
            return new Set([
                ...selection.incoming_nodes.map((node) => node.id),
                ...selection.outgoing_nodes.map((node) => node.id),
                selected_node_id ?? "",
            ]);
        }

        return new Set<string>();
    }, [selection, selected_node_id]);

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

        set_transform({ x, y, scale });
    }, [layout.height, layout.width]);

    useEffect(() => {
        fit_to_view();
        window.addEventListener("resize", fit_to_view);
        return () => {
            window.removeEventListener("resize", fit_to_view);
        };
    }, [fit_to_view]);

    const update_zoom = useCallback(
        (next_scale: number, anchor_x?: number, anchor_y?: number) => {
            const container = container_ref.current;
            if (!container) {
                return;
            }
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
        [],
    );

    const on_wheel = useCallback(
        (event: React.WheelEvent<HTMLElement>) => {
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
            event.currentTarget.setPointerCapture(event.pointerId);
            pointer_ref.current = { x: event.clientX, y: event.clientY };
            dragged_ref.current = false;
            set_is_panning(true);
        },
        [],
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
                highlighted_edge_ids={highlighted_edge_ids}
                on_pointer_down={on_pointer_down}
                on_pointer_move={on_pointer_move}
                on_pointer_up={on_pointer_up}
                on_canvas_click={on_canvas_click}
                on_zoom_in={() => update_zoom(transform.scale * 1.12)}
                on_zoom_out={() => update_zoom(transform.scale * 0.88)}
                on_reset={fit_to_view}
                on_select_node={set_selected_node_id}
            />
            <GraphDetails
                selection={selection}
                selected_node={selected_node}
                on_select_node={set_selected_node_id}
            />
        </section>
    );
}
