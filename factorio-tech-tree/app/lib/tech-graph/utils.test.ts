import assert from "node:assert/strict";
import { test } from "node:test";

import type { GraphNode } from "../tech-tree/types";
import { compute_total_requirements } from "./utils";

function science_node(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
    return {
        id,
        title: id,
        prerequisites: [],
        level: 0,
        is_infinite: false,
        research_type: "science",
        research_science: {
            unit_count: 10,
            science_packs: [{ name: "Automation science pack", amount_per_unit: 1 }],
        },
        ...overrides,
    };
}

function total_requirements(nodes: GraphNode[], ids = nodes.map((node) => node.id)) {
    return compute_total_requirements(ids, new Map(nodes.map((node) => [node.id, node])));
}

test("counts the selected technology and shared prerequisites once, without dependents", () => {
    const nodes = [
        science_node("root"),
        science_node("left", { prerequisites: ["root"] }),
        science_node("right", { prerequisites: ["root"] }),
        science_node("selected", { prerequisites: ["left", "right"] }),
        science_node("dependent", { prerequisites: ["selected"] }),
    ];
    assert.deepEqual(total_requirements(nodes, ["root", "left", "root", "right", "selected"]), {
        pack_totals: [{ internal_name: "automation_science_pack", name: "Automation science pack", amount: 40 }],
        excluded_count: 0,
    });
});

test("multiplies numeric and text costs and keeps science packs in progression order", () => {
    const nodes = [science_node("numeric"), science_node("text", {
        research_science: {
            unit_count_text: " 1,200 ",
            science_packs: [
                { name: "Logistic science pack", amount_text: "2.5" },
                { name: "Automation science pack", amount_text: "" },
            ],
        },
    })];
    assert.deepEqual(total_requirements(nodes), {
        pack_totals: [
            { internal_name: "automation_science_pack", name: "Automation science pack", amount: 1210 },
            { internal_name: "logistic_science_pack", name: "Logistic science pack", amount: 3000 },
        ],
        excluded_count: 0,
    });
});

test("reports infinite research and unresolved costs without losing finite prerequisites", () => {
    const nodes = [
        science_node("finite"),
        science_node("infinite", { is_infinite: true }),
        science_node("formula", {
            research_science: {
                unit_count_text: "1000 x 2^(Lv-3)",
                science_packs: [{ name: "Automation science pack" }],
            },
        }),
        science_node("missing", { research_science: null }),
    ];
    assert.equal(total_requirements(nodes).excluded_count, 3);
    assert.equal(total_requirements(nodes).pack_totals[0].amount, 10);
});

test("excludes invalid unit counts and pack quantities", () => {
    for (const value of [-1, NaN, Infinity]) {
        for (const field of ["unit_count", "amount_per_unit"]) {
            const node = science_node("invalid");
            if (field === "unit_count") node.research_science!.unit_count = value;
            else node.research_science!.science_packs[0].amount_per_unit = value;
            assert.deepEqual(total_requirements([node]), { pack_totals: [], excluded_count: 1 });
        }
    }
    const node = science_node("invalid-text", {
        research_science: {
            unit_count_text: "100",
            science_packs: [{ name: "Automation science pack", amount_text: "unknown" }],
        },
    });
    assert.deepEqual(total_requirements([node]), { pack_totals: [], excluded_count: 1 });
});

test("handles empty selections, condition research, missing IDs, and zero costs", () => {
    assert.deepEqual(total_requirements([]), { pack_totals: [], excluded_count: 0 });
    assert.deepEqual(total_requirements([science_node("condition", {
        research_type: "condition",
        research_science: null,
    })], ["condition", "missing"]), { pack_totals: [], excluded_count: 0 });
    const node = science_node("free");
    node.research_science!.unit_count = 0;
    assert.equal(total_requirements([node]).pack_totals[0].amount, 0);
    assert.equal(total_requirements([node]).excluded_count, 0);
});
