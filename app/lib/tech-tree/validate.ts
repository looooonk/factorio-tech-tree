import type { TechNode } from "./types";

export function validate_nodes(nodes: TechNode[]) {
    const ids = new Set<string>();
    const positive = (value: number) => Number.isFinite(value) && value > 0;
    for (const node of nodes) {
        if (!/^[a-z0-9_-]+$/.test(node.id) || ids.has(node.id)) {
            throw new Error(`Invalid or duplicate technology ID: ${node.id}`);
        }
        ids.add(node.id);
        if (!node.title?.trim() || !node.description?.trim()) {
            throw new Error(`Missing title or description: ${node.id}`);
        }
        if (!node.image_path?.startsWith("/data/technology/")) {
            throw new Error(`Missing technology icon: ${node.id}`);
        }
        if (node.is_infinite !== (node.max_research_level === "infinite") ||
            !Number.isInteger(node.research_level) || node.research_level < 0 ||
            (node.max_research_level !== "infinite" &&
                (!Number.isInteger(node.max_research_level) || node.max_research_level < node.research_level))) {
            throw new Error(`Invalid research levels: ${node.id}`);
        }
        if (node.research_type === "science") {
            const cost = node.research_science;
            if (!cost || node.research_trigger || !positive(cost.time_seconds) ||
                (cost.unit_count === null) === (cost.count_formula === null) ||
                (cost.unit_count !== null && (!positive(cost.unit_count) || !Number.isSafeInteger(cost.unit_count))) ||
                (cost.count_formula !== null && !cost.count_formula.trim()) ||
                !cost.science_packs.length ||
                cost.science_packs.some((pack) => !positive(pack.amount_per_unit) || !pack.id || !pack.name)) {
                throw new Error(`Invalid research cost: ${node.id}`);
            }
        } else if (node.research_type !== "condition" || node.research_science ||
            !node.research_trigger || !node.research_condition_text?.trim() ||
            (node.research_trigger.count !== undefined && !positive(node.research_trigger.count))) {
            throw new Error(`Invalid research trigger: ${node.id}`);
        }
        if (node.effects.some((effect) => !effect.type || !effect.description?.trim())) {
            throw new Error(`Invalid research effect: ${node.id}`);
        }
    }
    if (!ids.size) throw new Error("The technology dataset is empty.");
    for (const node of nodes) {
        if (new Set(node.prerequisites).size !== node.prerequisites.length) {
            throw new Error(`Duplicate prerequisites: ${node.id}`);
        }
        for (const id of node.prerequisites) {
            if (!ids.has(id) || id === node.id) throw new Error(`Invalid prerequisite: ${node.id} -> ${id}`);
        }
        for (const pack of node.research_science?.science_packs ?? []) {
            if (!ids.has(pack.technology_id)) throw new Error(`Missing science technology: ${pack.technology_id}`);
        }
    }
    const remaining = new Map(nodes.map((node) => [node.id, node.prerequisites]));
    while (remaining.size) {
        const before = remaining.size;
        for (const [id, deps] of remaining) {
            if (deps.every((dep) => !remaining.has(dep))) remaining.delete(id);
        }
        if (remaining.size === before) throw new Error(`Technology cycle: ${[...remaining.keys()].join(", ")}`);
    }
}
