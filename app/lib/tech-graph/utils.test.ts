import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import type { GraphNode, SciencePack } from "../tech-tree/types";
import { compute_total_requirements, resolve_unit_text } from "./utils";

const manifest = JSON.parse(fs.readFileSync(new URL("../../../data/manifest.json", import.meta.url), "utf8"));
const packs: SciencePack[] = manifest.science_packs;
const automation = JSON.parse(fs.readFileSync(new URL("../../../data/tech_tree.jsonl", import.meta.url), "utf8")
    .split("\n").find((line) => line && JSON.parse(line).id === "automation")!);

function science_node(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
    return { ...structuredClone(automation), id, level: 0, prerequisites: [], ...overrides };
}

function total_requirements(nodes: GraphNode[], ids = nodes.map((node) => node.id)) {
    return compute_total_requirements(ids, new Map(nodes.map((node) => [node.id, node])));
}

test("counts shared prerequisites once and excludes unselected dependents", () => {
    const nodes = [science_node("root"), science_node("left"), science_node("right"),
        science_node("selected"), science_node("dependent")];
    assert.deepEqual(total_requirements(nodes, ["root", "left", "root", "right", "selected"]), {
        pack_totals: [{ ...packs[0], amount: 40 }], excluded_count: 0,
    });
});

test("multiplies native numeric costs and sorts science packs by game order", () => {
    const nodes = [science_node("numeric"), science_node("multiple", { research_science: {
        unit_count: 1200, count_formula: null, time_seconds: 30,
        science_packs: [{ ...packs[1], amount_per_unit: 2.5 }, { ...packs[0], amount_per_unit: 1 }],
    } })];
    assert.deepEqual(total_requirements(nodes), {
        pack_totals: [{ ...packs[0], amount: 1210 }, { ...packs[1], amount: 3000 }], excluded_count: 0,
    });
});

test("excludes repeatable, finite ranges, and formula costs without losing finite prerequisites", () => {
    const formula = { unit_count: null, count_formula: "1000*(L - 2)", time_seconds: 60,
        science_packs: [{ ...packs[0], amount_per_unit: 1 }] };
    const nodes = [science_node("finite"), science_node("infinite", { is_infinite: true, max_research_level: "infinite" }),
        science_node("range", { research_level: 1, max_research_level: 3 }),
        science_node("formula", { research_science: formula }), science_node("missing", { research_science: null })];
    assert.equal(total_requirements(nodes).excluded_count, 4);
    assert.equal(total_requirements(nodes).pack_totals[0].amount, 10);
    assert.equal(resolve_unit_text(formula), "1000*(L - 2)");
});

test("excludes invalid quantities and handles empty or trigger selections", () => {
    for (const value of [-1, NaN, Infinity]) {
        for (const field of ["unit_count", "amount_per_unit"]) {
            const node = science_node("invalid");
            if (field === "unit_count") node.research_science!.unit_count = value;
            else node.research_science!.science_packs[0].amount_per_unit = value;
            assert.deepEqual(total_requirements([node]), { pack_totals: [], excluded_count: 1 });
        }
    }
    assert.deepEqual(total_requirements([]), { pack_totals: [], excluded_count: 0 });
    assert.deepEqual(total_requirements([science_node("condition", {
        research_type: "condition", research_science: null,
    })], ["condition", "missing"]), { pack_totals: [], excluded_count: 0 });
});
