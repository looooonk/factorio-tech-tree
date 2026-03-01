import type { GraphNode, ResearchScience } from "../tech-tree/types";
import {
    node_icon_size,
    node_item_gap,
    node_meta_height,
    node_padding_y,
    node_title_height,
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
    return node.image_path ?? `data/tech_images/${node.id}.png`;
}

export function get_node_height(node: GraphNode) {
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

export function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}
