import type { GraphEdge, GraphNode } from "../tech-tree/types";

export type Transform = {
    x: number;
    y: number;
    scale: number;
};

export type GraphEdgePath = GraphEdge & { path: string };

export type GraphSelection =
    | { mode: "none" }
    | {
        mode: "node";
        incoming_edges: GraphEdge[];
        outgoing_edges: GraphEdge[];
        incoming_nodes: GraphNode[];
        outgoing_nodes: GraphNode[];
    };
