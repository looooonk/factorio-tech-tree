import type { DataManifest, TechNode } from "./types";
import { game_profiles, type GameProfile } from "./profiles";

export function validate_nodes(nodes: TechNode[], profile?: GameProfile) {
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
        if (!/^\/data\/(base|space-age)\/technology\/[a-z0-9_-]+\.png$/.test(node.image_path) ||
            (profile && !node.image_path.startsWith(`/data/${profile}/`))) {
            throw new Error(`Missing technology icon: ${node.id}`);
        }
        const asset_prefix = node.image_path.split("/technology/")[0];
        const valid_icon = (image_path: string, kinds: string) =>
            new RegExp(`^${asset_prefix}/(${kinds})/[a-z0-9_-]+\\.png$`).test(image_path);
        if (node.research_science?.science_packs.some((pack) => !valid_icon(pack.image_path, "item")) ||
            node.effects.some((effect) => effect.image_path && !valid_icon(effect.image_path, "recipe|quality|space-location"))) {
            throw new Error(`Invalid or mixed-profile icon: ${node.id}`);
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

export function validate_manifest(manifest: DataManifest, nodes: TechNode[], profile: GameProfile) {
    if (manifest.schema_version !== 1 || manifest.locale !== "en" || manifest.profile !== profile ||
        manifest.mods.map((mod) => mod.name).join() !== game_profiles[profile].mods.join() ||
        manifest.mods.some((mod) => mod.version !== manifest.game_version) ||
        Object.keys(manifest.startup_settings).length || manifest.technology_count !== nodes.length ||
        manifest.locale_description_count !== nodes.filter((node) => node.description_source === "locale").length ||
        manifest.effect_description_count !== nodes.filter((node) => node.description_source === "effects").length) {
        throw new Error(`Invalid ${profile} game data manifest. Regenerate with npm run data:generate.`);
    }
    const ids = new Set(nodes.map((node) => node.id));
    const packs = new Map(manifest.science_packs.map((pack) => [pack.id, pack]));
    if (!packs.size || packs.size !== manifest.science_packs.length || manifest.science_packs.some((pack) =>
        !ids.has(pack.technology_id) || !pack.name || pack.image_path !== `/data/${profile}/item/${pack.id}.png`)) {
        throw new Error(`Invalid ${profile} science-pack metadata.`);
    }
    for (const node of nodes) {
        for (const pack of node.research_science?.science_packs ?? []) {
            const expected = packs.get(pack.id);
            if (!expected || Object.entries(expected).some(([key, value]) => pack[key as keyof typeof expected] !== value)) {
                throw new Error(`Mismatched science-pack metadata: ${node.id} -> ${pack.id}`);
            }
        }
    }
}
