import assert from "node:assert/strict";
import { test } from "node:test";
import { normalize_data } from "./normalize";
import type { Locales, RawData } from "./types";

function fixture(): { raw: RawData; locales: Locales } {
    return {
        raw: {
            tool: { "automation-science-pack": { name: "automation-science-pack", order: "a" } },
            recipe: { "assembling-machine-1": { name: "assembling-machine-1" } },
            technology: {
                "automation-science-pack": { type: "technology", name: "automation-science-pack",
                    research_trigger: { type: "craft-item", item: "lab" } },
                automation: { type: "technology", name: "automation", prerequisites: ["automation-science-pack"],
                    unit: { count: 10, time: 10, ingredients: [["automation-science-pack", 1]] },
                    effects: [{ type: "unlock-recipe", recipe: "assembling-machine-1" }] },
                "mining-productivity-3": { type: "technology", name: "mining-productivity-3", prerequisites: ["automation"],
                    max_level: "infinite", unit: { count_formula: "1000*(L - 2)", time: 60, ingredients: [["automation-science-pack", 1]] },
                    effects: [{ type: "mining-drill-productivity-bonus", modifier: 0.1 }] },
            },
        },
        locales: {
            technology: {
                names: { "automation-science-pack": "Automation science pack", automation: "Automation", "mining-productivity-3": "Mining productivity 3" },
                descriptions: { "automation-science-pack": "Craft [item=automation-science-pack] in a [entity=assembling-machine-1].\nResearch on [planet=nauvis]." },
            },
            item: { names: { "automation-science-pack": "Automation science pack", lab: "Lab" }, descriptions: {} },
            entity: { names: { "assembling-machine-1": "Assembling machine 1" }, descriptions: {} },
            recipe: { names: { "assembling-machine-1": "Assembling machine 1" }, descriptions: {} },
            "space-location": { names: { nauvis: "Nauvis" }, descriptions: {} },
        },
    };
}

test("normalizes native IDs, default trigger counts, markup, effects, and explicit infinite research", () => {
    const { raw, locales } = fixture();
    const { nodes } = normalize_data(raw, locales);
    const pack = nodes.find((node) => node.id === "automation-science-pack")!;
    assert.equal(pack.description, "Craft Automation science pack in a Assembling machine 1.\nResearch on Nauvis.");
    assert.equal(pack.research_condition_text, "Craft 1 × Lab.");
    assert.equal(pack.description_source, "locale");
    const automation = nodes.find((node) => node.id === "automation")!;
    assert.equal(automation.description, "Unlock recipe: Assembling machine 1.");
    assert.equal(automation.description_source, "effects");
    assert.equal(automation.research_science!.unit_count, 10);
    const infinite = nodes.find((node) => node.is_infinite)!;
    assert.equal(infinite.id, "mining-productivity-3");
    assert.equal(infinite.title, "Mining productivity 3+");
    assert.equal(infinite.research_level, 3);
    assert.equal(infinite.research_family, "mining-productivity");
    assert.equal(infinite.description, "Mining productivity: +10%.");
    assert(!infinite.prerequisites.includes(infinite.id));
    assert.deepEqual(normalize_data(raw, locales), normalize_data(raw, locales));
});

test("fails on missing references, unknown effects, and conflicting research definitions", () => {
    for (const mutate of [
        (raw: RawData) => { raw.technology.automation.prerequisites = ["missing"]; },
        (raw: RawData) => { delete raw.recipe["assembling-machine-1"]; },
        (raw: RawData) => { raw.technology.automation.effects = [{ type: "unknown-effect" }]; },
        (raw: RawData) => { raw.technology.automation.unit!.ingredients = [["unknown-pack", 1]]; },
        (raw: RawData) => { raw.technology.automation.research_trigger = { type: "capture-spawner" }; },
    ]) {
        const { raw, locales } = fixture();
        mutate(raw);
        assert.throws(() => normalize_data(raw, locales));
    }
    const { raw, locales } = fixture();
    delete locales.recipe.names["assembling-machine-1"];
    assert.throws(() => normalize_data(raw, locales), /localization/);
});
