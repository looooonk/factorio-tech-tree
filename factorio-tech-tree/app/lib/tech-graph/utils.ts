import type { GraphNode, ResearchScience } from "../tech-tree/types";
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
    science_pack_name_map,
    science_pack_size,
} from "./constants";

export function format_title(title: string) {
    return title.replace(/\s*\(research\)\s*$/i, "").trim();
}

export function resolve_time_text(research_science: ResearchScience | null | undefined) {
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

export function resolve_unit_text(research_science: ResearchScience | null | undefined) {
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

export function format_condition_text(text: string) {
    return text.replace(/\s+/g, " ").trim();
}

export function get_science_pack_icons(node: GraphNode | null | undefined) {
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

export function get_node_icon_path(node: GraphNode) {
    const path = node.image_path ?? `/data/tech_images/${node.id}.png`;
    if (!path.startsWith("/") && !path.startsWith("http")) {
        return `/${path}`;
    }
    return path;
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

function parse_numeric_text(text: string | null | undefined): number | null {
    if (!text) {
        return null;
    }
    const cleaned = text.replace(/,/g, "").trim();
    if (!/^\d+(\.\d+)?$/.test(cleaned)) {
        return null;
    }
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
}

// Formula-based and repeatable research cannot be included in a finite total.
function resolve_node_science_totals(
    node: GraphNode,
): Map<string, number> | null {
    if (node.research_type !== "science") {
        return new Map();
    }
    if (node.is_infinite || !node.research_science) return null;
    const research_science = node.research_science;
    const unit_count =
        typeof research_science.unit_count === "number"
            ? research_science.unit_count
            : parse_numeric_text(research_science.unit_count_text);
    if (unit_count === null || !Number.isFinite(unit_count) || unit_count < 0) {
        return null;
    }
    const totals = new Map<string, number>();
    for (const pack of research_science.science_packs) {
        const internal_name = science_pack_name_map[pack.name];
        if (!internal_name) {
            continue;
        }
        const per_unit =
            typeof pack.amount_per_unit === "number"
                ? pack.amount_per_unit
                : (pack.amount_text?.trim() ? parse_numeric_text(pack.amount_text) : 1);
        if (per_unit === null || !Number.isFinite(per_unit) || per_unit < 0) return null;
        totals.set(internal_name, (totals.get(internal_name) ?? 0) + unit_count * per_unit);
    }
    return totals;
}

export type TotalRequirements = {
    pack_totals: { internal_name: string; name: string; amount: number }[];
    excluded_count: number;
};

export function compute_total_requirements(
    node_ids: Iterable<string>,
    nodes_by_id: Map<string, GraphNode>,
): TotalRequirements {
    const totals = new Map<string, number>();
    let excluded_count = 0;
    for (const id of new Set(node_ids)) {
        const node = nodes_by_id.get(id);
        if (!node) {
            continue;
        }
        const node_totals = resolve_node_science_totals(node);
        if (node_totals === null) {
            excluded_count += 1;
            continue;
        }
        for (const [internal_name, amount] of node_totals) {
            totals.set(internal_name, (totals.get(internal_name) ?? 0) + amount);
        }
    }
    const pack_totals = Object.entries(science_pack_name_map)
        .filter(([, internal_name]) => totals.has(internal_name))
        .map(([name, internal_name]) => ({
            internal_name,
            name,
            amount: totals.get(internal_name)!,
        }));
    return { pack_totals, excluded_count };
}
