import type { GraphNode, ResearchScience } from "../tech-tree/types";
import {
    node_icon_size,
    node_item_gap,
    node_meta_height,
    node_padding_bottom,
    node_padding_top,
    node_padding_x,
    node_title_font_size,
    node_title_line_height,
    node_width,
    science_pack_gap,
    science_pack_name_map,
    science_pack_size,
} from "./constants";

let text_measure_canvas: HTMLCanvasElement | null = null;

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

function measure_text_width(text: string, font: string) {
    if (typeof document === "undefined") {
        return null;
    }
    if (!text_measure_canvas) {
        text_measure_canvas = document.createElement("canvas");
    }
    const context = text_measure_canvas.getContext("2d");
    if (!context) {
        return null;
    }
    context.font = font;
    return context.measureText(text).width;
}

function estimate_title_lines(title: string, max_width: number) {
    const trimmed = title.trim();
    if (!trimmed) {
        return 1;
    }
    const font = `${node_title_font_size}px "Space Grotesk", "Helvetica Neue", Arial, sans-serif`;
    const avg_char_width = node_title_font_size * 0.56;
    const width_of = (text: string) =>
        measure_text_width(text, font) ?? text.length * avg_char_width;
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
    const gap_count = rows > 0 ? 2 : 1;
    const title = format_title(node.title ?? "");
    const title_lines = estimate_title_lines(title, node_width - node_padding_x);
    const title_height = title_lines * node_title_line_height;
    return (
        node_padding_top +
        node_icon_size +
        title_height +
        node_meta_height +
        science_height +
        gap_count * node_item_gap +
        node_padding_bottom
    );
}

export function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}
