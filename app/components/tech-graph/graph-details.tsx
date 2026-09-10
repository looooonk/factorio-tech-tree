import Image from "next/image";
import type { GraphNode } from "../../lib/tech-tree/types";
import type { GraphSelection } from "../../lib/tech-graph/types";
import {
    format_condition_text,
    format_title,
    get_node_icon_path,
    resolve_time_text,
    resolve_unit_text,
} from "../../lib/tech-graph/utils";

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
        <aside className="graph-details" data-no-pan data-no-zoom>
            <div className="details-title">Technology details</div>
            {selection.mode === "none" && (
                <div className="details-empty">
                    Select a technology to inspect its research cost and connections.
                </div>
            )}
            {selection.mode === "node" && selected_node && (
                <div className="details-block">
                    <div className="details-selected-icon">
                        <Image
                            src={get_node_icon_path(selected_node)}
                            alt={format_title(selected_node.title)}
                            width={190}
                            height={190}
                            unoptimized
                            loading="lazy"
                            draggable={false}
                        />
                    </div>
                    <div className="details-node">
                        <div className="details-node-title">
                            <span className="details-node-title-text">
                                {format_title(selected_node.title)}
                            </span>
                        </div>
                    </div>
                    <div className="details-section">
                        <p className="details-description">{selected_node.description}</p>
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
                                        <span className="details-research-label">Time per unit</span>
                                        <span className="details-research-value">
                                            {resolve_time_text(selected_node.research_science) ??
                                                "N/A"}
                                        </span>
                                    </div>
                                </div>
                                {selected_node.research_science.count_formula && (
                                    <div className="details-formula-note">
                                        L is the research level, starting at {selected_node.research_level}.
                                        {selected_node.is_infinite && " This research repeats indefinitely."}
                                    </div>
                                )}
                                <div className="details-science-list">
                                    {selected_node.research_science.science_packs.map((pack) => {
                                        return (
                                            <button
                                                key={pack.id}
                                                type="button"
                                                className="details-science-pack details-science-pack-button"
                                                onClick={() => {
                                                    on_focus_node(pack.technology_id);
                                                }}
                                                aria-label={`Open ${pack.name} research`}
                                                title={`Open ${pack.name} research`}
                                            >
                                                <Image
                                                    src={pack.image_path}
                                                    alt={pack.name}
                                                    width={43}
                                                    height={43}
                                                    unoptimized
                                                    loading="lazy"
                                                    draggable={false}
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
                    {selected_node.effects.some((effect) => !effect.hidden) && (
                        <div className="details-section">
                            <div className="details-section-title">Effects</div>
                            <ul className="details-effects">
                                {selected_node.effects.filter((effect) => !effect.hidden).map((effect, index) => (
                                    <li className="details-effect" key={`${effect.type}-${index}`}>
                                        {effect.image_path && (
                                            <Image src={effect.image_path} alt="" width={32} height={32}
                                                unoptimized loading="lazy" draggable={false} />
                                        )}
                                        <span>{effect.description}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
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
                                            <Image
                                                src={get_node_icon_path(node)}
                                                alt={format_title(node.title)}
                                                width={40}
                                                height={40}
                                                unoptimized
                                                loading="lazy"
                                                draggable={false}
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
                                            <Image
                                                src={get_node_icon_path(node)}
                                                alt={format_title(node.title)}
                                                width={40}
                                                height={40}
                                                unoptimized
                                                loading="lazy"
                                                draggable={false}
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
