import type { GraphNode, ResearchScience, SciencePack } from "../tech-tree/types";
import { evaluate_research_formula } from "./research-formula";
import {
    node_icon_size,
    node_item_gap,
    node_meta_height,
    node_padding_bottom,
    node_padding_top,
    node_padding_x,
    node_science_gap_min,
    node_title_font_size,
    node_title_line_height,
    node_width,
    science_pack_gap,
    science_pack_size,
} from "./constants";

export function format_title(title: string) {
    return title.trim();
}

export function resolve_time_text(research_science: ResearchScience | null | undefined) {
    return research_science ? `${research_science.time_seconds}s` : null;
}

export function resolve_unit_text(research_science: ResearchScience | null | undefined) {
    return research_science?.count_formula ?? research_science?.unit_count?.toLocaleString("en-US") ?? null;
}

export function format_condition_text(text: string) {
    return text.replace(/\s+/g, " ").trim();
}

export function get_science_pack_icons(node: GraphNode | null | undefined) {
    return node?.research_science?.science_packs ?? [];
}

export function get_node_icon_path(node: GraphNode) {
    return node.image_path;
}

function estimate_title_lines(title: string, max_width: number) {
    const trimmed = title.trim();
    if (!trimmed) {
        return 1;
    }
    const avg_char_width = node_title_font_size * 0.56;
    const width_of = (text: string) => text.length * avg_char_width;
    const words = trimmed.split(/\s+/);
    let lines = 1;
    let line = "";
    for (const word of words) {
        const next_line = line ? `${line} ${word}` : word;
        if (width_of(next_line) <= max_width) {
            line = next_line;
            continue;
        }
        if (line) {
            lines += 1;
            line = word;
            continue;
        }
        const chars_per_line = Math.max(1, Math.floor(max_width / avg_char_width));
        lines += Math.max(1, Math.ceil(word.length / chars_per_line)) - 1;
        line = "";
    }
    return Math.max(1, lines);
}

export function get_node_height(node: GraphNode) {
    const science_icons = get_science_pack_icons(node);
    const rows = science_icons.length > 0 ? 1 : 0;
    const science_height =
        rows > 0 ? rows * science_pack_size + Math.max(0, rows - 1) * science_pack_gap : 0;
    const title_gap = node_item_gap;
    const science_gap = rows > 0 ? node_science_gap_min : 0;
    const title = format_title(node.title ?? "");
    const title_lines = estimate_title_lines(title, node_width - node_padding_x);
    const title_height = title_lines * node_title_line_height;
    return (
        node_padding_top +
        node_icon_size +
        title_gap +
        title_height +
        node_meta_height +
        science_height +
        science_gap +
        node_padding_bottom
    );
}

export function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export type TotalRequirements = {
    pack_totals: (SciencePack & { amount: number })[];
    excluded_count: number;
};

export function compute_total_requirements(
    node_ids: Iterable<string>,
    nodes_by_id: Map<string, GraphNode>,
): TotalRequirements {
    const totals = new Map<string, SciencePack & { amount: number }>();
    let excluded_count = 0;
    for (const id of new Set(node_ids)) {
        const node = nodes_by_id.get(id);
        if (!node || node.research_type !== "science") continue;
        const cost = node.research_science;
        const unit_count = cost?.count_formula
            ? evaluate_research_formula(cost.count_formula, node.research_level)
            : cost?.unit_count;
        if ((typeof node.max_research_level === "number" && node.max_research_level > node.research_level) || !cost ||
            unit_count == null || !Number.isFinite(unit_count) || unit_count < 0 ||
            cost.science_packs.some((pack) => !Number.isFinite(pack.amount_per_unit) || pack.amount_per_unit < 0)) {
            excluded_count += 1;
            continue;
        }
        for (const pack of cost.science_packs) {
            const amount = (totals.get(pack.id)?.amount ?? 0) + unit_count * pack.amount_per_unit;
            totals.set(pack.id, { id: pack.id, name: pack.name, image_path: pack.image_path,
                technology_id: pack.technology_id, order: pack.order, amount });
        }
    }
    return { pack_totals: [...totals.values()].sort((a, b) => a.order.localeCompare(b.order, "en")), excluded_count };
}
