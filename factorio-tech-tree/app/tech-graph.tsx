"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GraphNode = {
    id: string;
    title: string;
    image_path?: string;
    prerequisites: string[];
    level: number;
    is_infinite: boolean;
    research_type?: string | null;
    research_science?: ResearchScience | null;
    research_condition_text?: string | null;
};

type ResearchSciencePack = {
    name: string;
    amount_per_unit?: number | null;
    amount_text?: string | null;
};

type ResearchScience = {
    time_seconds?: number | null;
    time_text?: string | null;
    unit_count?: number | null;
    unit_count_text?: string | null;
    science_packs: ResearchSciencePack[];
};

type GraphEdge = {
    id: string;
    from: string;
    to: string;
    is_self_loop?: boolean;
};

type GraphViewProps = {
    nodes: GraphNode[];
    edges: GraphEdge[];
    root_ids: string[];
};

type Layout = {
    width: number;
    height: number;
    positions: Record<string, { x: number; y: number }>;
    sizes: Record<string, { width: number; height: number }>;
};

const node_width = 300;
const node_gap_x = 80;
const node_gap_y = 110;
const canvas_padding = 80;
const min_zoom = 0.35;
const max_zoom = 2.5;
const node_padding_y = 28;
const node_item_gap = 10;
const node_icon_size = 72;
const node_title_height = 36;
const node_meta_height = 12;
const science_pack_size = 56;
const science_pack_gap = 6;
const science_pack_name_map: Record<string, string> = {
    "Automation science pack": "automation_science_pack",
    "Logistic science pack": "logistic_science_pack",
    "Military science pack": "military_science_pack",
    "Chemical science pack": "chemical_science_pack",
    "Production science pack": "production_science_pack",
    "Utility science pack": "utility_science_pack",
    "Space science pack": "space_science_pack",
    "Metallurgic science pack": "metallurgic_science_pack",
    "Agricultural science pack": "agricultural_science_pack",
    "Electromagnetic science pack": "electromagnetic_science_pack",
    "Cryogenic science pack": "cryogenic_science_pack",
    "Promethium science pack": "promethium_science_pack",
};

function format_title(title: string) {
    return title.replace(/\s*\(research\)\s*$/i, "").trim();
}

function resolve_time_text(research_science: ResearchScience | null | undefined) {
    if (!research_science) {
        return null;
    }
    const raw = research_science.time_text?.trim();
    if (raw && raw.length > 0) {
        return raw.endsWith("s") ? raw : `${raw}s`;
    }
    if (typeof research_science.time_seconds === "number") {
        return `${research_science.time_seconds}s`;
    }
    return null;
}

function resolve_unit_text(research_science: ResearchScience | null | undefined) {
    if (!research_science) {
        return null;
    }
    const raw = research_science.unit_count_text?.trim();
    if (raw && raw.length > 0) {
        return raw;
    }
    if (typeof research_science.unit_count === "number") {
        return research_science.unit_count.toString();
    }
    return null;
}

function format_condition_text(text: string) {
    return text.replace(/\s+/g, " ").trim();
}

function get_science_pack_icons(node: GraphNode | null | undefined) {
    if (!node || node.research_type !== "science" || !node.research_science) {
        return [];
    }
    return node.research_science.science_packs
        .map((pack) => {
            const internal_name = science_pack_name_map[pack.name];
            if (!internal_name) {
                return null;
            }
            return { internal_name, name: pack.name };
        })
        .filter((pack): pack is { internal_name: string; name: string } => pack !== null)
        .slice(0, 12);
}

function get_node_icon_path(node: GraphNode) {
    return node.image_path ?? `data/tech_images/${node.id}.png`;
}

function get_node_height(node: GraphNode) {
    const science_icons = get_science_pack_icons(node);
    const rows = Math.ceil(science_icons.length / 4);
    const science_height =
        rows > 0 ? rows * science_pack_size + Math.max(0, rows - 1) * science_pack_gap : 0;
    const gap_count = rows > 0 ? 3 : 2;
    return (
        node_padding_y +
        node_icon_size +
        node_title_height +
        node_meta_height +
        science_height +
        gap_count * node_item_gap
    );
}

function build_layout(nodes: GraphNode[]): Layout {
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

    for (const level_nodes of nodes_by_level.values()) {
        level_nodes.sort((a, b) => a.title.localeCompare(b.title));
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

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export default function TechGraph({ nodes, edges, root_ids }: GraphViewProps) {
    const container_ref = useRef<HTMLDivElement | null>(null);
    const [transform, set_transform] = useState({ x: 0, y: 0, scale: 1 });
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

    const edges_with_paths = useMemo(() => {
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
            .filter((edge): edge is GraphEdge & { path: string } => edge !== null);
    }, [edges, layout.positions]);

    const selected_node = useMemo(() => {
        if (!selected_node_id) {
            return null;
        }
        return nodes_by_id.get(selected_node_id) ?? null;
    }, [nodes_by_id, selected_node_id]);

    const selection = useMemo(() => {
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
                    <button type="button" onClick={() => update_zoom(transform.scale * 1.12)}>
                        Zoom in
                    </button>
                    <button type="button" onClick={() => update_zoom(transform.scale * 0.88)}>
                        Zoom out
                    </button>
                    <button type="button" onClick={fit_to_view}>
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
                        {edges_with_paths.map((edge) => {
                            const is_highlighted = highlighted_edge_ids.has(edge.id);
                            const is_dimmed =
                                highlighted_edge_ids.size > 0 && !highlighted_edge_ids.has(edge.id);
                            return (
                                <g key={edge.id}>
                                    <path
                                        className={`edge-line${is_dimmed ? " edge-dimmed" : ""}${is_highlighted ? " edge-highlight" : ""
                                            }`}
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
                            const is_dimmed =
                                related_node_ids.size > 0 && !related_node_ids.has(node.id);
                            return (
                                <button
                                    key={node.id}
                                    type="button"
                                    data-no-pan
                                    className={`graph-node${is_selected ? " is-selected" : ""}${is_related ? " is-related" : ""
                                        }${is_dimmed ? " is-dimmed" : ""}${root_set.has(node.id) ? " is-root" : ""
                                        }${node.is_infinite ? " is-infinite" : ""}`}
                                    style={{
                                        left: position.x,
                                        top: position.y,
                                        width: size.width,
                                        height: size.height,
                                    }}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        set_selected_node_id(node.id);
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
                                                <div key={pack.internal_name} className="graph-node-science-pack">
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
            <aside className="graph-details">
                <div className="details-title">Selection</div>
                {selection.mode === "none" && (
                    <div className="details-empty">
                        Click a node to see its incoming and outgoing connections.
                    </div>
                )}
                {selection.mode === "node" && selected_node && (
                    <div className="details-block">
                        <div className="details-selected-icon">
                            <img
                                src={`/api/tech-image?path=${encodeURIComponent(
                                    get_node_icon_path(selected_node),
                                )}`}
                                alt={format_title(selected_node.title)}
                                loading="lazy"
                            />
                        </div>
                        <div className="details-node">
                            <div className="details-node-title">{format_title(selected_node.title)}</div>
                            <div className="details-node-meta">{selected_node.id}</div>
                        </div>
                        <div className="details-section">
                            <div className="details-section-title">Requirements</div>
                            {selected_node.research_type === "science" &&
                                selected_node.research_science ? (
                                <div className="details-research">
                                    <div className="details-research-metrics">
                                        <div className="details-research-metric">
                                            <span className="details-research-label">Unit count</span>
                                            <span className="details-research-value">
                                                {resolve_unit_text(selected_node.research_science) ?? "N/A"}
                                            </span>
                                        </div>
                                        <div className="details-research-metric">
                                            <span className="details-research-label">Time</span>
                                            <span className="details-research-value">
                                                {resolve_time_text(selected_node.research_science) ?? "N/A"}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="details-science-list">
                                        {selected_node.research_science.science_packs.map((pack) => {
                                            const internal_name = science_pack_name_map[pack.name];
                                            if (!internal_name) {
                                                return null;
                                            }
                                            return (
                                                <div key={pack.name} className="details-science-pack">
                                                    <img
                                                        src={`/api/tech-image?path=${encodeURIComponent(
                                                            `data/tech_images/${internal_name}.png`,
                                                        )}`}
                                                        alt={pack.name}
                                                        loading="lazy"
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : selected_node.research_condition_text ? (
                                <div className="details-condition">
                                    {format_condition_text(selected_node.research_condition_text)}
                                </div>
                            ) : (
                                <div className="details-empty">No research requirements.</div>
                            )}
                        </div>
                        <div className="details-section">
                            <div className="details-section-title">Incoming</div>
                            {selection.incoming_nodes.length === 0 ? (
                                <div className="details-empty">No prerequisites.</div>
                            ) : (
                                <div className="details-list">
                                    {selection.incoming_nodes.map((node) => (
                                        <button
                                            key={node.id}
                                            type="button"
                                            className="details-link"
                                            onClick={() => {
                                                set_selected_node_id(node.id);
                                            }}
                                        >
                                            <span className="details-link-icon">
                                                <img
                                                    src={`/api/tech-image?path=${encodeURIComponent(
                                                        get_node_icon_path(node),
                                                    )}`}
                                                    alt={format_title(node.title)}
                                                    loading="lazy"
                                                />
                                            </span>
                                            <span className="details-link-text">
                                                {format_title(node.title)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="details-section">
                            <div className="details-section-title">Outgoing</div>
                            {selection.outgoing_nodes.length === 0 ? (
                                <div className="details-empty">No dependents.</div>
                            ) : (
                                <div className="details-list">
                                    {selection.outgoing_nodes.map((node) => (
                                        <button
                                            key={node.id}
                                            type="button"
                                            className="details-link"
                                            onClick={() => {
                                                set_selected_node_id(node.id);
                                            }}
                                        >
                                            <span className="details-link-icon">
                                                <img
                                                    src={`/api/tech-image?path=${encodeURIComponent(
                                                        get_node_icon_path(node),
                                                    )}`}
                                                    alt={format_title(node.title)}
                                                    loading="lazy"
                                                />
                                            </span>
                                            <span className="details-link-text">
                                                {format_title(node.title)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </aside>
        </section>
    );
}
