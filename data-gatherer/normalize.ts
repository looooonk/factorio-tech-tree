import type { ResearchEffect, ResearchTrigger, SciencePack, TechNode } from "../app/lib/tech-tree/types";
import { validate_nodes } from "../app/lib/tech-tree/validate";
import type { Locales, RawData, RawTechnology } from "./types";

const numeric_effects: Record<string, [string, boolean]> = {
    "artillery-range": ["Artillery shell range", true],
    "maximum-following-robots-count": ["Maximum following robots", false],
    "bulk-inserter-capacity-bonus": ["Bulk inserter capacity", false],
    "inserter-stack-size-bonus": ["Non-bulk inserter capacity", false],
    "character-mining-speed": ["Character mining speed", true],
    "laboratory-speed": ["Lab research speed", true],
    "laboratory-productivity": ["Lab research productivity", true],
    "character-inventory-slots-bonus": ["Character inventory slots", false],
    "train-braking-force-bonus": ["Train braking force", true],
    "character-logistic-trash-slots": ["Character logistic trash slots", false],
    "worker-robot-speed": ["Worker robot speed", true],
    "worker-robot-storage": ["Worker robot capacity", false],
    "mining-drill-productivity-bonus": ["Mining productivity", true],
    "belt-stack-size-bonus": ["Transport belt stack height", false],
    "character-health-bonus": ["Character health", false],
};

const boolean_effects: Record<string, string> = {
    "cliff-deconstruction-enabled": "Deconstruct cliffs",
    "unlock-space-platforms": "Build space platforms",
    "create-ghost-on-entity-death": "Create ghosts when entities are destroyed",
    "character-logistic-requests": "Use personal logistic requests",
    "vehicle-logistics": "Use vehicle logistics",
    "mining-with-fluid": "Mine resources that require fluids",
    "unlock-circuit-network": "Use the circuit network",
    "rail-planner-allow-elevated-rails": "Plan elevated rails over obstacles",
    "rail-support-on-deep-oil-ocean": "Build elevated rails on deep oil ocean",
};

function number_text(value: number) {
    return Number(value.toFixed(8)).toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function bonus(value: number | boolean | undefined, percent: boolean) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid effect modifier.");
    return `${value >= 0 ? "+" : ""}${number_text(value * (percent ? 100 : 1))}${percent ? "%" : ""}`;
}

export function normalize_data(raw: RawData, locales: Locales) {
    const name = (kind: string, id: string | undefined): string => {
        const value = id && locales[kind]?.names[id];
        if (!value) throw new Error(`Missing ${kind} localization: ${id}`);
        return value;
    };
    const text = (value: string) => value.replace(
        /\[(item|entity|fluid|planet|technology|recipe|quality)=([^\]]+)\]/g,
        (_, kind: string, id: string) => name(kind === "planet" ? "space-location" : kind, id),
    ).replace(/\[\/?(?:color|font)(?:=[^\]]+)?\]/g, "").trim();
    const icon = (kind: string, id: string) => `/data/${kind}/${id}.png`;

    const science_packs: SciencePack[] = Object.values(raw.tool).map((pack) => ({
        id: pack.name,
        name: name("item", pack.name),
        image_path: icon("item", pack.name),
        technology_id: pack.name,
        order: pack.order ?? pack.name,
    })).sort((a, b) => a.order.localeCompare(b.order, "en"));
    const packs_by_id = new Map(science_packs.map((pack) => [pack.id, pack]));

    const effect = (source: NonNullable<RawTechnology["effects"]>[number]): ResearchEffect => {
        let description: string;
        let image_path: string | undefined;
        switch (source.type) {
            case "unlock-recipe":
            case "change-recipe-productivity": {
                if (!source.recipe || !raw.recipe[source.recipe]) throw new Error(`Missing recipe: ${source.recipe}`);
                const recipe = name("recipe", source.recipe);
                description = source.type === "unlock-recipe"
                    ? `Unlock recipe: ${recipe}`
                    : `${recipe} productivity: ${bonus(source.change!, true)}`;
                image_path = icon("recipe", source.recipe);
                break;
            }
            case "unlock-quality":
                description = `Unlock ${name("quality", source.quality)} quality`;
                image_path = icon("quality", source.quality!);
                break;
            case "unlock-space-location":
                description = `Discover ${name("space-location", source.space_location)}`;
                image_path = icon("space-location", source.space_location!);
                break;
            case "ammo-damage":
            case "gun-speed":
                description = `${name("ammo-category", source.ammo_category)} ${source.type === "ammo-damage" ? "damage" : "shooting speed"}: ${bonus(source.modifier, true)}`;
                break;
            case "turret-attack":
                description = `${name("entity", source.turret_id)} damage: ${bonus(source.modifier, true)}`;
                break;
            default: {
                const numeric = numeric_effects[source.type];
                const boolean = boolean_effects[source.type];
                if (numeric && typeof source.modifier === "number") {
                    description = `${numeric[0]}: ${bonus(source.modifier, numeric[1])}`;
                } else if (boolean && typeof source.modifier === "boolean") {
                    description = `${source.modifier ? "Enable" : "Disable"}: ${boolean}`;
                } else {
                    throw new Error(`Unsupported research effect: ${source.type}`);
                }
            }
        }
        return { ...source, description: text(description), ...(image_path ? { image_path } : {}) };
    };

    const trigger_text = (trigger: ResearchTrigger) => {
        const count = number_text(trigger.count ?? 1);
        switch (trigger.type) {
            case "craft-item": return `Craft ${count} × ${name("item", trigger.item)}.`;
            case "craft-fluid": return `Produce ${count} units of ${name("fluid", trigger.fluid)}.`;
            case "build-entity": return `Build ${count} × ${name("entity", trigger.entity)}.`;
            case "mine-entity": return `Mine ${count} × ${name("entity", trigger.entity)}.`;
            case "create-space-platform": return "Create a space platform.";
            case "capture-spawner": return `Capture ${count} enemy spawner${(trigger.count ?? 1) === 1 ? "" : "s"}.`;
            case "send-item-to-orbit": return `Send ${count} × ${name("item", trigger.item)} to orbit.`;
            default: throw new Error(`Unsupported research trigger: ${trigger.type}`);
        }
    };

    const nodes: TechNode[] = Object.values(raw.technology).map((tech): TechNode => {
        const effects = (tech.effects ?? []).map(effect);
        const description = text(locales.technology.descriptions[tech.name] ?? "");
        const suffix = /^(.*)-(\d+)$/.exec(tech.name);
        const is_infinite = tech.max_level === "infinite";
        const research_level = suffix ? Number(suffix[2]) : (is_infinite || tech.unit?.count_formula ? 1 : 0);
        const title = name("technology", tech.name);
        const visible_effects = effects.filter((entry) => !entry.hidden);
        if (Boolean(tech.unit) === Boolean(tech.research_trigger)) throw new Error(`Ambiguous research: ${tech.name}`);
        return {
            id: tech.name,
            title: is_infinite
                ? `${title.replace(new RegExp(` ${research_level}$`), "")} ${research_level}+`
                : title,
            description: description || `${visible_effects.map((entry) => entry.description).join("; ")}.`,
            description_source: description ? "locale" : "effects",
            image_path: icon("technology", tech.name),
            prerequisites: tech.prerequisites ?? [],
            research_level,
            max_research_level: tech.max_level ?? research_level,
            research_family: suffix ? suffix[1] : null,
            is_infinite,
            hidden: tech.hidden ?? false,
            enabled: tech.enabled ?? true,
            visible_when_disabled: tech.visible_when_disabled ?? false,
            ignore_tech_cost_multiplier: tech.ignore_tech_cost_multiplier ?? false,
            research_type: tech.unit ? "science" : "condition",
            research_science: tech.unit ? {
                time_seconds: tech.unit.time,
                unit_count: tech.unit.count ?? null,
                count_formula: tech.unit.count_formula ?? null,
                science_packs: tech.unit.ingredients.map(([id, amount]) => {
                    const pack = packs_by_id.get(id);
                    if (!pack) throw new Error(`Unknown science pack: ${tech.name} -> ${id}`);
                    return { ...pack, amount_per_unit: amount };
                }).sort((a, b) => a.order.localeCompare(b.order, "en")),
            } : null,
            research_trigger: tech.research_trigger ?? null,
            research_condition_text: tech.research_trigger ? text(trigger_text(tech.research_trigger)) : null,
            effects,
        };
    }).sort((a, b) => a.id.localeCompare(b.id, "en"));
    for (const node of nodes) {
        if (/\[[^\]]+=|__[^\s]+__/.test(node.description) || node.description === ".") {
            throw new Error(`Unresolved description: ${node.id}`);
        }
    }
    validate_nodes(nodes);
    return { nodes, science_packs };
}
