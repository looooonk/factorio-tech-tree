import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import loadTechTree, { build_graph } from "./load-tech-tree";
import type { TechNode } from "./types";
import { validate_nodes } from "./validate";
import { build_layout } from "../tech-graph/graph-layout";

async function sample(): Promise<TechNode> {
    const data = await loadTechTree();
    const node = { ...structuredClone(data.nodes.find((node) => node.id === "automation")!), prerequisites: [] };
    node.research_science!.science_packs.forEach((pack) => { pack.technology_id = node.id; });
    return node;
}

test("the committed Space Age graph has complete descriptions, dependencies, costs, and icons", async () => {
    const { nodes, edges, root_ids, manifest } = await loadTechTree();
    assert.equal(nodes.length, manifest.technology_count);
    assert.equal(nodes.filter((node) => node.description_source === "locale").length, manifest.locale_description_count);
    assert.equal(nodes.filter((node) => node.description_source === "effects").length, manifest.effect_description_count);
    assert.deepEqual(manifest.mods.map((mod) => mod.name), ["base", "elevated-rails", "quality", "space-age"]);
    assert(nodes.every((node) => node.description.trim() && !/\[(item|entity|fluid|planet)=/.test(node.description)));
    assert(edges.every((edge) => edge.from !== edge.to));
    assert(root_ids.length > 0);
    const by_id = new Map(nodes.map((node) => [node.id, node]));
    assert(by_id.get("rail-support-foundations")!.prerequisites.includes("elevated-rail"));
    assert(by_id.has("elevated-rail"));
    const mining = by_id.get("mining-productivity-3")!;
    assert.equal(mining.is_infinite, true);
    assert.equal(mining.research_science!.count_formula, "1000*(L - 2)");
    assert(!by_id.has("mining-productivity-4"));
    assert.equal(by_id.get("automation")!.description, "Key technology for automatic mass production.");
    assert.equal(by_id.get("space-science-pack")!.research_trigger!.type, "build-entity");
    const assets = new Set(nodes.flatMap((node) => [node.image_path,
        ...node.effects.flatMap((effect) => effect.image_path ? [effect.image_path] : []),
        ...(node.research_science?.science_packs.map((pack) => pack.image_path) ?? [])]));
    for (const asset of assets) {
        const bytes = await fs.readFile(path.join(process.cwd(), "public", asset));
        assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
    }
    const layout = build_layout(nodes);
    assert.equal(Object.keys(layout.positions).length, nodes.length);
    assert(layout.group_columns.length > 0);
    assert(Object.values(layout.positions).every((position) => Number.isFinite(position.x) && Number.isFinite(position.y)));
});

test("rejects duplicate IDs, missing prerequisites, self loops, cycles, and invalid costs", async () => {
    const node = await sample();
    assert.throws(() => validate_nodes([node, node]), /duplicate/);
    assert.throws(() => validate_nodes([{ ...node, prerequisites: ["missing"] }]), /Invalid prerequisite/);
    assert.throws(() => validate_nodes([{ ...node, prerequisites: [node.id] }]), /Invalid prerequisite/);
    assert.throws(() => validate_nodes([{ ...node, prerequisites: ["second"] },
        { ...node, id: "second", prerequisites: [node.id] }]), /cycle/);
    assert.throws(() => validate_nodes([{ ...node, description: "" }]), /description/);
    for (const count of [0, -1, Infinity, 1.5]) {
        assert.throws(() => validate_nodes([{ ...node, research_science: { ...node.research_science!, unit_count: count } }]), /cost/);
    }
    assert.throws(() => validate_nodes([{ ...node, is_infinite: true }]), /levels/);
});

test("resolves graph levels and handles hidden and disabled prototypes explicitly", async () => {
    const node = await sample();
    const graph = build_graph([node, { ...node, id: "second", prerequisites: [node.id] },
        { ...node, id: "hidden", hidden: true }, { ...node, id: "disabled", enabled: false },
        { ...node, id: "visible-disabled", enabled: false, visible_when_disabled: true }]);
    assert.deepEqual(graph.nodes.map((entry) => [entry.id, entry.level]), [[node.id, 0], ["second", 1], ["visible-disabled", 0]]);
    assert.throws(() => build_graph([{ ...node, hidden: true },
        { ...node, id: "second", prerequisites: [node.id] }]), /unavailable/);
});
