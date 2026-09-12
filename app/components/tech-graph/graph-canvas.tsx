import { memo, useMemo } from "react";
import type { CSSProperties, MouseEvent, PointerEvent, RefObject } from "react";
import Image from "next/image";
import { FaTools } from "react-icons/fa";
import { FiEye, FiEyeOff } from "react-icons/fi";

import DepthToggle from "../depth-toggle";
import type { DepthMode } from "../depth-toggle";
import type { GraphNode } from "../../lib/tech-tree/types";
import type { Layout } from "../../lib/tech-graph/graph-layout";
import type { GraphEdgePath } from "../../lib/tech-graph/types";
import type { TotalRequirements } from "../../lib/tech-graph/utils";
import { mobile_media_query, node_width, science_pack_size, science_pack_gap } from "../../lib/tech-graph/constants";
import {
    format_title,
    get_node_height,
    get_node_icon_path,
    get_science_pack_icons,
} from "../../lib/tech-graph/utils";

// --- Types ---

type GraphCanvasProps = {
    game_version: string;
    container_ref: RefObject<HTMLDivElement | null>;
    viewport_ref: RefObject<HTMLDivElement | null>;
    layout: Layout;
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
    on_click_capture: (event: MouseEvent<HTMLDivElement>) => void;
    on_zoom_in: () => void;
    on_zoom_out: () => void;
    on_reset: () => void;
    on_select_node: (node_id: string) => void;
    on_focus_node: (node_id: string) => void;
    depth_mode: DepthMode;
    on_change_depth_mode: (mode: DepthMode) => void;
    total_requirements: TotalRequirements | null;
    totals_visible: boolean;
    details_visible: boolean;
    on_toggle_totals: () => void;
    on_toggle_details: () => void;
    on_navigate_history: (direction: "back" | "forward") => void;
};

// --- Sub-components ---

type GraphNodeButtonProps = {
    node: GraphNode;
    layout: Layout;
    is_selected: boolean;
    is_related: boolean;
    is_filtered_out: boolean;
    is_search_match: boolean;
    is_root: boolean;
    on_select_node: (node_id: string) => void;
};

/**
 * The maximum number of science packs that fit at full size before we need to
 * compress them via negative-margin overlap. 4 packs x 56px + 3 gaps x 6px = 242px.
 */
const science_row_max_width = 4 * science_pack_size + 3 * science_pack_gap;

/** Renders a single tech-tree node button with its icon, title, and science pack row. */
const GraphNodeButton = memo(function GraphNodeButton({
    node,
    layout,
    is_selected,
    is_related,
    is_filtered_out,
    is_search_match,
    is_root,
    on_select_node,
}: GraphNodeButtonProps) {
    const position = layout.positions[node.id];
    if (!position) return null;

    const science_icons = get_science_pack_icons(node);
    const science_count = science_icons.length;
    const size = layout.sizes[node.id] ?? { width: node_width, height: get_node_height(node) };

    // When more than 4 packs are present, overlap them so the row stays within
    // science_row_max_width. Otherwise use the normal gap between icons.
    const science_overlap =
        science_count > 4
            ? (science_pack_size * science_count - science_row_max_width) /
              Math.max(1, science_count - 1)
            : 0;
    const science_style: CSSProperties | undefined =
        science_count > 0
            ? {
                  "--science-gap": `${science_count > 4 ? 0 : science_pack_gap}px`,
                  "--science-overlap": `${science_overlap}px`,
              } as CSSProperties
            : undefined;

    const class_name = [
        "graph-node",
        science_icons.length > 0 && "has-science",
        is_selected && "is-selected",
        is_related && "is-related",
        is_search_match && "is-search-match",
        is_filtered_out && "is-dimmed",
        is_root && "is-root",
        node.is_infinite && "is-infinite",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <button
            type="button"
            data-no-pan
            className={class_name}
            style={{ left: position.x, top: position.y, width: size.width, height: size.height }}
            onClick={(event) => {
                event.stopPropagation();
                on_select_node(node.id);
            }}
        >
            <div className="graph-node-icon">
                <Image
                    src={get_node_icon_path(node)}
                    alt={format_title(node.title)}
                    width={168}
                    height={168}
                    unoptimized
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                />
            </div>
            <div className="graph-node-title">{format_title(node.title)}</div>
            {science_icons.length > 0 && (
                <div className="graph-node-science" style={science_style}>
                    {science_icons.map((pack) => (
                        <div key={pack.id} className="graph-node-science-pack">
                            <Image
                                src={pack.image_path}
                                alt={pack.name}
                                width={56}
                                height={56}
                                unoptimized
                                loading="lazy"
                                decoding="async"
                                draggable={false}
                            />
                        </div>
                    ))}
                </div>
            )}
        </button>
    );
});

// --- Main component ---

export default function GraphCanvas({
    game_version,
    container_ref,
    viewport_ref,
    layout,
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
    on_click_capture,
    on_zoom_in,
    on_zoom_out,
    on_reset,
    on_select_node,
    on_focus_node,
    depth_mode,
    on_change_depth_mode,
    total_requirements,
    totals_visible,
    details_visible,
    on_toggle_totals,
    on_toggle_details,
    on_navigate_history,
}: GraphCanvasProps) {
    const misc_active = active_filters.has("misc");
    const edge_path = useMemo(() => edges.map((edge) => edge.path).join(" "), [edges]);
    const highlighted_path = useMemo(
        () => edges
            .filter((edge) => highlighted_edge_ids.has(edge.id))
            .map((edge) => edge.path)
            .join(" "),
        [edges, highlighted_edge_ids],
    );

    return (
        <div
            ref={container_ref}
            className={`graph-canvas${details_visible ? "" : " is-details-hidden"}`}
            onPointerDown={on_pointer_down}
            onPointerMove={on_pointer_move}
            onPointerUp={on_pointer_up}
            onPointerCancel={on_pointer_up}
            onLostPointerCapture={on_pointer_up}
            onClickCapture={on_click_capture}
        >
            <div className="graph-touch-surface" aria-hidden="true" />
            <div className="graph-titlebar" data-no-pan data-no-zoom>
                <div className="graph-titlebar-name">
                    <span className="graph-titlebar-light" aria-hidden />
                    Factorio Technology Tree
                </div>
                <span className="graph-data-version">Space Age · {game_version}</span>
            </div>

            <div className="graph-view-panel" id="graph-view-panel" data-no-pan data-no-zoom>
                <div className="graph-toolbar-group" data-no-pan data-no-zoom>
                    <div className="graph-panel-title">View controls</div>
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
                    <DepthToggle mode={depth_mode} on_change={on_change_depth_mode} />
                    <div className="graph-mobile-history">
                        <button type="button" className="graph-filter-action" onClick={() => on_navigate_history("back")}>Previous</button>
                        <button type="button" className="graph-filter-action" onClick={() => on_navigate_history("forward")}>Next</button>
                    </div>
                    <div className="graph-panel-toggles" role="group" aria-label="Panel visibility">
                        <button
                            type="button"
                            className="graph-filter-action"
                            aria-label="Total requirements panel"
                            aria-pressed={totals_visible}
                            title={`${totals_visible ? "Hide" : "Show"} total requirements`}
                            onClick={on_toggle_totals}
                        >
                            {totals_visible ? <FiEye aria-hidden /> : <FiEyeOff aria-hidden />}
                            Totals
                        </button>
                        <button
                            type="button"
                            className="graph-filter-action"
                            aria-label="Technology details panel"
                            aria-pressed={details_visible}
                            title={`${details_visible ? "Hide" : "Show"} technology details`}
                            onClick={on_toggle_details}
                        >
                            {details_visible ? <FiEye aria-hidden /> : <FiEyeOff aria-hidden />}
                            Details
                        </button>
                    </div>
                </div>

                {total_requirements && (
                    <section className="graph-totals-panel" aria-label="Total requirements" data-no-pan data-no-zoom>
                        <div className="graph-panel-title">Total requirements</div>
                        {total_requirements.pack_totals.length === 0 ? (
                            <div className="graph-totals-empty">No science pack requirements.</div>
                        ) : (
                            <div className="graph-totals-list">
                                {total_requirements.pack_totals.map((pack) => (
                                    <div key={pack.id} className="graph-totals-item" title={pack.name}>
                                        <Image
                                            src={pack.image_path}
                                            alt={pack.name}
                                            width={32}
                                            height={32}
                                            unoptimized
                                            loading="lazy"
                                            decoding="async"
                                            draggable={false}
                                        />
                                        <span className="graph-totals-count">
                                            {Math.round(pack.amount).toLocaleString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {total_requirements.excluded_count > 0 && (
                            <div className="graph-totals-note">
                                {total_requirements.excluded_count} unresolved{" "}
                                {total_requirements.excluded_count === 1 ? "tech" : "techs"} excluded.
                            </div>
                        )}
                    </section>
                )}
                <p className="graph-mobile-hint">Drag to pan. Pinch to zoom. Select a technology and enable all required research to see totals.</p>
            </div>

            <div className="graph-filter-stack" id="graph-search-panel" data-no-pan data-no-zoom>
                <div className="graph-filter-panel" data-no-pan data-no-zoom>
                    <div className="graph-panel-heading">
                        <div className="graph-panel-title">Research filters</div>
                        <div className="graph-filter-actions">
                            <button
                                type="button"
                                className="graph-filter-action"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    on_select_all_filters();
                                }}
                            >
                                All
                            </button>
                            <button
                                type="button"
                                className="graph-filter-action"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    on_deselect_all_filters();
                                }}
                            >
                                None
                            </button>
                        </div>
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
                                    <Image
                                        src={filter.icon_path}
                                        alt={filter.label}
                                        width={28}
                                        height={28}
                                        unoptimized
                                        loading="lazy"
                                        decoding="async"
                                        draggable={false}
                                    />
                                </button>
                            );
                        })}
                        <button
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
                <div className="graph-search-panel" data-no-pan data-no-zoom>
                    <div className="graph-panel-title">Find technology</div>
                    <div className="graph-filter-search">
                        <input
                            type="search"
                            value={search_query}
                            placeholder="Search technology"
                            aria-label="Search technology"
                            className="graph-filter-input"
                            data-no-pan
                            data-no-zoom
                            onChange={(event) => on_search_query_change(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                        />
                    </div>
                    {search_query.trim().length > 0 && (
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
                                            if (window.matchMedia(mobile_media_query).matches) {
                                                event.currentTarget.closest(".graph-search-panel")?.querySelector("input")?.blur();
                                            }
                                        }}
                                    >
                                        <span className="graph-filter-result-icon">
                                            <Image
                                                src={get_node_icon_path(node)}
                                                alt={format_title(node.title)}
                                                width={26}
                                                height={26}
                                                unoptimized
                                                loading="lazy"
                                                decoding="async"
                                                draggable={false}
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
                    )}
                </div>
            </div>

            <div className="graph-footer" data-no-pan data-no-zoom>
                <div className="graph-shortcuts">
                    <span>
                        <span className="graph-shortcut-key" aria-hidden="true">⌫</span>
                        <span className="graph-shortcut-label">Previous</span>
                    </span>
                    <span>
                        <span className="graph-shortcut-key" aria-hidden="true">⏎</span>
                        <span className="graph-shortcut-label">Next</span>
                    </span>
                </div>

                <div className="graph-credit">
                    <span>Community tool by Taehoon Hwang.</span>
                    <br />
                    <span>Contribute on </span>
                    <a
                        href="https://github.com/looooonk/factorio-tech-tree"
                        target="_blank"
                        rel="noreferrer"
                    >
                        GitHub
                    </a>
                    <span>.</span>
                </div>
            </div>

            <div
                ref={viewport_ref}
                className="graph-inner"
                style={{
                    width: layout.width,
                    height: layout.height,
                }}
            >
                <svg
                    className={`graph-edges${highlighted_edge_ids.size > 0 ? " has-selection" : ""}`}
                    width={layout.width}
                    height={layout.height}
                    viewBox={`0 0 ${layout.width} ${layout.height}`}
                >
                    {layout.group_columns.map((col, i) => (
                        <rect
                            key={i}
                            className="group-column-bg"
                            x={col.x}
                            y={col.y}
                            width={col.width}
                            height={col.height}
                            rx={24}
                        />
                    ))}
                    <path className="edge-line" d={edge_path} />
                    {highlighted_path && (
                        <path className="edge-line edge-highlight" d={highlighted_path} />
                    )}
                </svg>
                <div className={`graph-nodes${related_node_ids.size > 0 ? " has-selection" : ""}`}>
                    {nodes.map((node) => (
                        <GraphNodeButton
                            key={node.id}
                            node={node}
                            layout={layout}
                            is_selected={selected_node_id === node.id}
                            is_related={related_node_ids.has(node.id)}
                            is_filtered_out={!filter_match_ids.has(node.id)}
                            is_search_match={search_match_ids.has(node.id)}
                            is_root={root_set.has(node.id)}
                            on_select_node={on_select_node}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
