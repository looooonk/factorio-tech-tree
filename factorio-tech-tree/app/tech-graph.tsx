"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GraphNode = {
  id: string;
  title: string;
  image_path?: string;
  prerequisites: string[];
  level: number;
  is_infinite: boolean;
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
};

const node_width = 220;
const node_height = 190;
const node_gap_x = 80;
const node_gap_y = 110;
const canvas_padding = 80;
const min_zoom = 0.35;
const max_zoom = 2.5;

function format_title(title: string) {
  return title.replace(/\s*\(research\)\s*$/i, "").trim();
}

function build_layout(nodes: GraphNode[]): Layout {
  const nodes_by_level = new Map<number, GraphNode[]>();
  let max_level = 0;

  for (const node of nodes) {
    const level_nodes = nodes_by_level.get(node.level) ?? [];
    level_nodes.push(node);
    nodes_by_level.set(node.level, level_nodes);
    max_level = Math.max(max_level, node.level);
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
  const height =
    (max_level + 1) * node_height +
    max_level * node_gap_y +
    canvas_padding * 2;

  const positions: Record<string, { x: number; y: number }> = {};

  for (const [level, level_nodes] of nodes_by_level.entries()) {
    const row_width =
      level_nodes.length * node_width +
      Math.max(0, level_nodes.length - 1) * node_gap_x;
    const offset_x =
      canvas_padding + Math.max(0, (width - canvas_padding * 2 - row_width) / 2);
    const y = canvas_padding + level * (node_height + node_gap_y);

    for (const [index, node] of level_nodes.entries()) {
      positions[node.id] = {
        x: offset_x + index * (node_width + node_gap_x),
        y,
      };
    }
  }

  return { width, height, positions };
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
  const [selected_edge_id, set_selected_edge_id] = useState<string | null>(
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
        if (!from_pos || !to_pos) {
          return null;
        }
        if (edge.from === edge.to) {
          return null;
        }

        const start_x = from_pos.x + node_width / 2;
        const start_y = from_pos.y + node_height;
        const end_x = to_pos.x + node_width / 2;
        const end_y = to_pos.y;
        const mid_y = start_y + (end_y - start_y) * 0.55;
        const path = `M ${start_x} ${start_y} C ${start_x} ${mid_y}, ${end_x} ${mid_y}, ${end_x} ${end_y}`;
        return { ...edge, path };
      })
      .filter((edge): edge is GraphEdge & { path: string } => edge !== null);
  }, [edges, layout.positions]);

  const selected_edge = useMemo(() => {
    if (!selected_edge_id) {
      return null;
    }
    return edges.find((edge) => edge.id === selected_edge_id) ?? null;
  }, [edges, selected_edge_id]);

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

    if (selected_edge) {
      const from_node = nodes_by_id.get(selected_edge.from) ?? null;
      const to_node = nodes_by_id.get(selected_edge.to) ?? null;
      return {
        mode: "edge" as const,
        from_node,
        to_node,
      };
    }

    return { mode: "none" as const };
  }, [edges, nodes_by_id, selected_edge, selected_node_id]);

  const highlighted_edge_ids = useMemo(() => {
    if (selection.mode === "node") {
      return new Set([
        ...selection.incoming_edges.map((edge) => edge.id),
        ...selection.outgoing_edges.map((edge) => edge.id),
      ]);
    }

    if (selection.mode === "edge" && selected_edge) {
      return new Set([selected_edge.id]);
    }

    return new Set<string>();
  }, [selection, selected_edge]);

  const related_node_ids = useMemo(() => {
    if (selection.mode === "node") {
      return new Set([
        ...selection.incoming_nodes.map((node) => node.id),
        ...selection.outgoing_nodes.map((node) => node.id),
        selected_node_id ?? "",
      ]);
    }

    if (selection.mode === "edge" && selected_edge) {
      return new Set([selected_edge.from, selected_edge.to]);
    }

    return new Set<string>();
  }, [selection, selected_edge, selected_node_id]);

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
    set_selected_edge_id(null);
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
                    className={`edge-line${is_dimmed ? " edge-dimmed" : ""}${
                      is_highlighted ? " edge-highlight" : ""
                    }`}
                    d={edge.path}
                  />
                  <path
                    className="edge-hit"
                    data-no-pan
                    d={edge.path}
                    onClick={(event) => {
                      event.stopPropagation();
                      set_selected_edge_id(edge.id);
                      set_selected_node_id(null);
                    }}
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
              const is_selected = selected_node_id === node.id;
              const is_related = related_node_ids.has(node.id);
              const is_dimmed =
                related_node_ids.size > 0 && !related_node_ids.has(node.id);
              return (
                <button
                  key={node.id}
                  type="button"
                  data-no-pan
                  className={`graph-node${is_selected ? " is-selected" : ""}${
                    is_related ? " is-related" : ""
                  }${is_dimmed ? " is-dimmed" : ""}${
                    root_set.has(node.id) ? " is-root" : ""
                  }${node.is_infinite ? " is-infinite" : ""}`}
                  style={{
                    left: position.x,
                    top: position.y,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    set_selected_node_id(node.id);
                    set_selected_edge_id(null);
                  }}
                >
                  <div className="graph-node-icon">
                    <img
                      src={`/api/tech-image?path=${encodeURIComponent(
                        node.image_path ?? `data/tech_images/${node.id}.png`,
                      )}`}
                      alt={format_title(node.title)}
                      loading="lazy"
                    />
                  </div>
                  <div className="graph-node-title">{format_title(node.title)}</div>
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
            Click a node or edge to see its incoming and outgoing connections.
          </div>
        )}
        {selection.mode === "node" && selected_node && (
          <div className="details-block">
            <div className="details-node">
              <div className="details-node-title">{format_title(selected_node.title)}</div>
              <div className="details-node-meta">{selected_node.id}</div>
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
                        set_selected_edge_id(null);
                      }}
                    >
                      {format_title(node.title)}
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
                        set_selected_edge_id(null);
                      }}
                    >
                      {format_title(node.title)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {selection.mode === "edge" && selected_edge && (
          <div className="details-block">
            <div className="details-node">
              <div className="details-node-title">Connection</div>
              <div className="details-node-meta">{selected_edge.id}</div>
            </div>
            <div className="details-section">
              <div className="details-section-title">From</div>
              <div className="details-list">
                <button
                  type="button"
                  className="details-link"
                  onClick={() => {
                    set_selected_node_id(selected_edge.from);
                    set_selected_edge_id(null);
                  }}
                >
                  {format_title(nodes_by_id.get(selected_edge.from)?.title ?? "")}
                </button>
              </div>
            </div>
            <div className="details-section">
              <div className="details-section-title">To</div>
              <div className="details-list">
                <button
                  type="button"
                  className="details-link"
                  onClick={() => {
                    set_selected_node_id(selected_edge.to);
                    set_selected_edge_id(null);
                  }}
                >
                  {format_title(nodes_by_id.get(selected_edge.to)?.title ?? "")}
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </section>
  );
}
