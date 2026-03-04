import type { GraphNode } from "../../lib/tech-tree/types";
import type { GraphSelection } from "../../lib/tech-graph/types";
import { science_pack_name_map } from "../../lib/tech-graph/constants";
import {
    format_condition_text,
    format_title,
    get_node_icon_path,
    resolve_time_text,
    resolve_unit_text,
} from "../../lib/tech-graph/utils";
import { FaArrowUpRightFromSquare } from "react-icons/fa6";

type GraphDetailsProps = {
    selection: GraphSelection;
    selected_node: GraphNode | null;
    on_focus_node: (node_id: string) => void;
};

export default function GraphDetails({
    selection,
    selected_node,
    on_focus_node,
}: GraphDetailsProps) {
    return (
        <aside className="graph-details" data-no-zoom>
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
                            src={get_node_icon_path(selected_node)}
                            alt={format_title(selected_node.title)}
                            loading="lazy"
                        />
                    </div>
                    <div className="details-node">
                        <div className="details-node-title">
                            <span className="details-node-title-text">
                                {format_title(selected_node.title)}
                            </span>
                            {selected_node.url ? (
                                <a
                                    className="details-wiki-link"
                                    href={selected_node.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Open on Factorio Wiki"
                                    title="Open on Factorio Wiki"
                                >
                                    <FaArrowUpRightFromSquare />
                                </a>
                            ) : null}
                        </div>
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
                                            {resolve_unit_text(selected_node.research_science) ??
                                                "N/A"}
                                        </span>
                                    </div>
                                    <div className="details-research-metric">
                                        <span className="details-research-label">Time</span>
                                        <span className="details-research-value">
                                            {resolve_time_text(selected_node.research_science) ??
                                                "N/A"}
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
                                            <button
                                                key={pack.name}
                                                type="button"
                                                className="details-science-pack details-science-pack-button"
                                                onClick={() => {
                                                    on_focus_node(internal_name);
                                                }}
                                                aria-label={`Open ${pack.name} research`}
                                                title={`Open ${pack.name} research`}
                                            >
                                                <img
                                                    src={`/data/tech_images/${internal_name}.png`}
                                                    alt={pack.name}
                                                    loading="lazy"
                                                />
                                            </button>
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
                        <div className="details-section-title">Required Research</div>
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
                                            on_focus_node(node.id);
                                        }}
                                    >
                                        <span className="details-link-icon">
                                            <img
                                                src={get_node_icon_path(node)}
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
                        <div className="details-section-title">Allows</div>
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
                                            on_focus_node(node.id);
                                        }}
                                    >
                                        <span className="details-link-icon">
                                            <img
                                                src={get_node_icon_path(node)}
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
    );
}
