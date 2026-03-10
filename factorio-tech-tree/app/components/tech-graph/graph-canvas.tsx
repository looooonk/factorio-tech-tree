import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, RefObject } from "react";
import { FaTools } from "react-icons/fa";

import ThemeToggle from "../theme-toggle";
import type { GraphNode } from "../../lib/tech-tree/types";
import type { Layout } from "../../lib/tech-graph/graph-layout";
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
    filter_match_ids: Set<string>;
    search_match_ids: Set<string>;
    search_query: string;
    search_matches: GraphNode[];
    on_search_query_change: (next_query: string) => void;
    science_filters: {
        id: string;
        label: string;
        icon_path: string;
    }[];
    active_filters: Set<string>;
    on_toggle_filter: (filter_id: string) => void;
    on_select_all_filters: () => void;
    on_deselect_all_filters: () => void;
    highlighted_edge_ids: Set<string>;
    on_pointer_down: (event: PointerEvent<HTMLDivElement>) => void;
    on_pointer_move: (event: PointerEvent<HTMLDivElement>) => void;
    on_pointer_up: (event: PointerEvent<HTMLDivElement>) => void;
    on_zoom_in: () => void;
    on_zoom_out: () => void;
    on_reset: () => void;
    on_select_node: (node_id: string) => void;
    on_focus_node: (node_id: string) => void;
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
    filter_match_ids,
    search_match_ids,
    search_query,
    search_matches,
    on_search_query_change,
    science_filters,
    active_filters,
    on_toggle_filter,
    on_select_all_filters,
    on_deselect_all_filters,
    highlighted_edge_ids,
    on_pointer_down,
    on_pointer_move,
    on_pointer_up,
    on_zoom_in,
    on_zoom_out,
    on_reset,
    on_select_node,
    on_focus_node,
}: GraphCanvasProps) {
    const toolbar_ref = useRef<HTMLDivElement | null>(null);
    const filter_ref = useRef<HTMLDivElement | null>(null);
    const [controls_width, set_controls_width] = useState<number | null>(null);
    const misc_active = active_filters.has("misc");
    const science_row_width = 242;
    const science_pack_size = 56;
    const science_gap_default = 6;

    useLayoutEffect(() => {
        const toolbar = toolbar_ref.current;
        const filter = filter_ref.current;
        if (!toolbar || !filter) {
            return;
        }

        const update_width = () => {
            const toolbar_width = toolbar.getBoundingClientRect().width;
            const filter_width = filter.getBoundingClientRect().width;
            const next_width = Math.max(toolbar_width, filter_width);
            set_controls_width((current) => {
                if (current && Math.abs(current - next_width) < 0.5) {
                    return current;
                }
                return next_width;
            });
        };

        update_width();
        const observer = new ResizeObserver(() => {
            update_width();
        });
        observer.observe(toolbar);
        observer.observe(filter);

        return () => {
            observer.disconnect();
        };
    }, []);

    const control_style = controls_width ? { width: `${controls_width}px` } : undefined;

    return (
        <div
            ref={container_ref}
            className={`graph-canvas${is_panning ? " is-panning" : ""}`}
            onPointerDown={on_pointer_down}
            onPointerMove={on_pointer_move}
            onPointerUp={on_pointer_up}
            onPointerCancel={on_pointer_up}
        >
            <div className="graph-toolbar-group" data-no-pan>
                <div
                    className="graph-toolbar"
                    data-no-pan
                    ref={toolbar_ref}
                    style={control_style}
                >
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
                <ThemeToggle />
            </div>
            <div className="graph-filter-stack" data-no-pan data-no-zoom>
                <div
                    className="graph-filter-panel"
                    data-no-pan
                    data-no-zoom
                    ref={filter_ref}
                    style={control_style}
                >
                    <div className="graph-filter-actions">
                        <button
                            type="button"
                            className="graph-filter-action"
                            onClick={(event) => {
                                event.stopPropagation();
                                on_select_all_filters();
                            }}
                        >
                            Select all
                        </button>
                        <button
                            type="button"
                            className="graph-filter-action"
                            onClick={(event) => {
                                event.stopPropagation();
                                on_deselect_all_filters();
                            }}
                        >
                            Deselect all
                        </button>
                    </div>
                    <div className="graph-filter-grid">
                        {science_filters.map((filter) => {
                            const is_active = active_filters.has(filter.id);
                            return (
                                <button
                                    key={filter.id}
                                    type="button"
                                    className={`graph-filter-button${is_active ? " is-active" : ""}`}
                                    aria-pressed={is_active}
                                    aria-label={filter.label}
                                    title={filter.label}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        on_toggle_filter(filter.id);
                                    }}
                                >
                                    <img
                                        src={filter.icon_path}
                                        alt={filter.label}
                                        loading="lazy"
                                    />
                                </button>
                            );
                        })}
                        <button
                            key="misc"
                            type="button"
                            className={`graph-filter-button${misc_active ? " is-active" : ""}`}
                            aria-pressed={misc_active}
                            aria-label="Misc research"
                            title="Misc research"
                            onClick={(event) => {
                                event.stopPropagation();
                                on_toggle_filter("misc");
                            }}
                        >
                            <FaTools aria-hidden />
                        </button>
                    </div>
                </div>
                <div className="graph-search-panel" data-no-pan data-no-zoom style={control_style}>
                    <div className="graph-filter-search">
                        <input
                            type="search"
                            value={search_query}
                            placeholder="Search technology"
                            className="graph-filter-input"
                            data-no-pan
                            data-no-zoom
                            onChange={(event) => {
                                on_search_query_change(event.target.value);
                            }}
                            onClick={(event) => {
                                event.stopPropagation();
                            }}
                        />
                    </div>
                    {search_query.trim().length > 0 ? (
                        <div className="graph-filter-results" data-no-pan data-no-zoom>
                            {search_matches.length === 0 ? (
                                <div className="graph-filter-empty">No matches.</div>
                            ) : (
                                search_matches.map((node) => (
                                <button
                                    key={node.id}
                                    type="button"
                                    className="graph-filter-result"
                                    data-no-pan
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        on_focus_node(node.id);
                                    }}
                                >
                                        <span className="graph-filter-result-icon">
                                            <img
                                                src={get_node_icon_path(node)}
                                                alt={format_title(node.title)}
                                                loading="lazy"
                                            />
                                        </span>
                                        <span className="graph-filter-result-text">
                                            {format_title(node.title)}
                                        </span>
                                        <span className="graph-filter-result-meta">{node.id}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
            <div className="graph-shortcuts" data-no-pan data-no-zoom>
                <span>
                    <span className="graph-shortcut-key" aria-hidden="true">⌫</span>
                    <span className="graph-shortcut-label">previous</span>
                </span>
                <br />
                <span>
                    <span className="graph-shortcut-key" aria-hidden="true">⏎</span>
                    <span className="graph-shortcut-label">next</span>
                </span>
            </div>
            <div className="graph-credit" data-no-pan data-no-zoom>
                <span>Developed by Taehoon Hwang.</span>
                <br />
                <span>Aid development on </span>
                <a
                    href="https://github.com/looooonk/factorio-tech-tree"
                    target="_blank"
                    rel="noreferrer"
                >
                    GitHub
                </a>
                <span>.</span>
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
                        const is_edge_idle = highlighted_edge_ids.size === 0;
                        const is_edge_dimmed = !is_edge_idle && !is_highlighted;
                        return (
                            <g key={edge.id}>
                                <path
                                    className={`edge-line${is_edge_idle ? " edge-idle" : ""}${is_highlighted ? " edge-highlight" : ""}${is_edge_dimmed ? " edge-dimmed" : ""}`}
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
                        const science_count = science_icons.length;
                        const science_overlap =
                            science_count > 4
                                ? (science_pack_size * science_count - science_row_width) /
                                  Math.max(1, science_count - 1)
                                : 0;
                        const science_gap = science_count > 4 ? 0 : science_gap_default;
                        const science_style =
                            science_count > 0
                                ? ({
                                      "--science-gap": `${science_gap}px`,
                                      "--science-overlap": `${science_overlap}px`,
                                  } as CSSProperties)
                                : undefined;
                        const size = layout.sizes[node.id] ?? {
                            width: node_width,
                            height: get_node_height(node),
                        };
                        const is_selected = selected_node_id === node.id;
                        const is_related = related_node_ids.has(node.id);
                        const is_selection_dimmed = related_node_ids.size > 0 && !is_related;
                        const is_filtered_out = !filter_match_ids.has(node.id);
                        const is_search_match = search_match_ids.has(node.id);
                        return (
                            <button
                                key={node.id}
                                type="button"
                                data-no-pan
                                className={`graph-node${science_icons.length > 0 ? " has-science" : ""}${is_selected ? " is-selected" : ""}${is_related ? " is-related" : ""}${is_search_match ? " is-search-match" : ""}${is_selection_dimmed || is_filtered_out ? " is-dimmed" : ""}${root_set.has(node.id) ? " is-root" : ""}${node.is_infinite ? " is-infinite" : ""}`}
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
                                        src={get_node_icon_path(node)}
                                        alt={format_title(node.title)}
                                        loading="lazy"
                                    />
                                </div>
                                <div className="graph-node-title">{format_title(node.title)}</div>
                                {science_icons.length > 0 ? (
                                    <div className="graph-node-science" style={science_style}>
                                        {science_icons.map((pack) => (
                                            <div
                                                key={pack.internal_name}
                                                className="graph-node-science-pack"
                                            >
                                                <img
                                                    src={`/data/tech_images/${pack.internal_name}.png`}
                                                    alt={pack.name}
                                                    loading="lazy"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
