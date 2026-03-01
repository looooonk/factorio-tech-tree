import type { PointerEvent, RefObject } from "react";

import type { GraphNode } from "../../lib/tech-tree/types";
import type { Layout } from "../../lib/tech-graph/layout";
import type { GraphEdgePath, Transform } from "../../lib/tech-graph/types";
import { node_width } from "../../lib/tech-graph/constants";
import {
    format_title,
    get_node_height,
    get_node_icon_path,
    get_science_pack_icons,
} from "../../lib/tech-graph/utils";

type GraphCanvasProps = {
    container_ref: RefObject<HTMLDivElement | null>;
    is_panning: boolean;
    layout: Layout;
    transform: Transform;
    edges: GraphEdgePath[];
    nodes: GraphNode[];
    root_set: Set<string>;
    selected_node_id: string | null;
    related_node_ids: Set<string>;
    highlighted_edge_ids: Set<string>;
    on_pointer_down: (event: PointerEvent<HTMLDivElement>) => void;
    on_pointer_move: (event: PointerEvent<HTMLDivElement>) => void;
    on_pointer_up: (event: PointerEvent<HTMLDivElement>) => void;
    on_canvas_click: () => void;
    on_zoom_in: () => void;
    on_zoom_out: () => void;
    on_reset: () => void;
    on_select_node: (node_id: string) => void;
};

export default function GraphCanvas({
    container_ref,
    is_panning,
    layout,
    transform,
    edges,
    nodes,
    root_set,
    selected_node_id,
    related_node_ids,
    highlighted_edge_ids,
    on_pointer_down,
    on_pointer_move,
    on_pointer_up,
    on_canvas_click,
    on_zoom_in,
    on_zoom_out,
    on_reset,
    on_select_node,
}: GraphCanvasProps) {
    return (
        <div
            ref={container_ref}
            className={`graph-canvas${is_panning ? " is-panning" : ""}`}
            onPointerDown={on_pointer_down}
            onPointerMove={on_pointer_move}
            onPointerUp={on_pointer_up}
            onPointerCancel={on_pointer_up}
            onClick={on_canvas_click}
        >
            <div className="graph-toolbar" data-no-pan>
                <button type="button" onClick={on_zoom_in}>
                    Zoom in
                </button>
                <button type="button" onClick={on_zoom_out}>
                    Zoom out
                </button>
                <button type="button" onClick={on_reset}>
                    Reset
                </button>
            </div>
            <div
                className="graph-inner"
                style={{
                    width: layout.width,
                    height: layout.height,
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                }}
            >
                <svg
                    className="graph-edges"
                    width={layout.width}
                    height={layout.height}
                    viewBox={`0 0 ${layout.width} ${layout.height}`}
                >
                    {edges.map((edge) => {
                        const is_highlighted = highlighted_edge_ids.has(edge.id);
                        const is_dimmed =
                            highlighted_edge_ids.size > 0 && !highlighted_edge_ids.has(edge.id);
                        return (
                            <g key={edge.id}>
                                <path
                                    className={`edge-line${is_dimmed ? " edge-dimmed" : ""}${is_highlighted ? " edge-highlight" : ""}`}
                                    d={edge.path}
                                />
                            </g>
                        );
                    })}
                </svg>
                <div className="graph-nodes">
                    {nodes.map((node) => {
                        const position = layout.positions[node.id];
                        if (!position) {
                            return null;
                        }
                        const science_icons = get_science_pack_icons(node);
                        const size = layout.sizes[node.id] ?? {
                            width: node_width,
                            height: get_node_height(node),
                        };
                        const is_selected = selected_node_id === node.id;
                        const is_related = related_node_ids.has(node.id);
                        const is_dimmed = related_node_ids.size > 0 && !related_node_ids.has(node.id);
                        return (
                            <button
                                key={node.id}
                                type="button"
                                data-no-pan
                                className={`graph-node${is_selected ? " is-selected" : ""}${is_related ? " is-related" : ""}${is_dimmed ? " is-dimmed" : ""}${root_set.has(node.id) ? " is-root" : ""}${node.is_infinite ? " is-infinite" : ""}`}
                                style={{
                                    left: position.x,
                                    top: position.y,
                                    width: size.width,
                                    height: size.height,
                                }}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    on_select_node(node.id);
                                }}
                            >
                                <div className="graph-node-icon">
                                    <img
                                        src={`/api/tech-image?path=${encodeURIComponent(
                                            get_node_icon_path(node),
                                        )}`}
                                        alt={format_title(node.title)}
                                        loading="lazy"
                                    />
                                </div>
                                <div className="graph-node-title">{format_title(node.title)}</div>
                                {science_icons.length > 0 ? (
                                    <div className="graph-node-science">
                                        {science_icons.map((pack) => (
                                            <div
                                                key={pack.internal_name}
                                                className="graph-node-science-pack"
                                            >
                                                <img
                                                    src={`/api/tech-image?path=${encodeURIComponent(
                                                        `data/tech_images/${pack.internal_name}.png`,
                                                    )}`}
                                                    alt={pack.name}
                                                    loading="lazy"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="graph-node-meta">{node.id}</div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
