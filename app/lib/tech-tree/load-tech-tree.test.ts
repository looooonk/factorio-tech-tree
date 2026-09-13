import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import loadTechTree, { build_graph } from "./load-tech-tree";
import type { TechNode } from "./types";
import { validate_manifest, validate_nodes } from "./validate";
import { parse_game_profile } from "./profiles";
import { build_layout } from "../tech-graph/graph-layout";

async function sample(): Promise<TechNode> {
    const data = await loadTechTree();
    const node = { ...structuredClone(data.nodes.find((node) => node.id === "automation")!), prerequisites: [] };
    node.research_science!.science_packs.forEach((pack) => { pack.technology_id = node.id; });
    return node;
}

for (const profile of ["space-age", "base"] as const) {
    test(`the committed ${profile} graph has complete descriptions, dependencies, costs, and icons`, async () => {
        const { nodes, edges, root_ids, manifest } = await loadTechTree(profile);
        assert.equal(nodes.length, manifest.technology_count);
        assert.equal(nodes.filter((node) => node.description_source === "locale").length, manifest.locale_description_count);
        assert.equal(nodes.filter((node) => node.description_source === "effects").length, manifest.effect_description_count);
        assert.equal(manifest.profile, profile);
        assert.deepEqual(manifest.mods.map((mod) => mod.name), profile === "base" ? ["base"] : ["base", "elevated-rails", "quality", "space-age"]);
        assert(nodes.every((node) => node.description.trim() && !/\[(item|entity|fluid|planet)=/.test(node.description)));
        assert(edges.every((edge) => edge.from !== edge.to));
        assert(root_ids.length > 0);
        const by_id = new Map(nodes.map((node) => [node.id, node]));
        if (profile === "space-age") assert(by_id.get("rail-support-foundations")!.prerequisites.includes("elevated-rail"));
        assert.equal(by_id.has("elevated-rail"), profile === "space-age");
        const mining = by_id.get(profile === "base" ? "mining-productivity-4" : "mining-productivity-3")!;
        assert.equal(mining.is_infinite, true);
        assert.equal(mining.research_science!.count_formula, profile === "base" ? "2500*(L - 3)" : "1000*(L - 2)");
        assert.equal(by_id.has("mining-productivity-4"), profile === "base");
        assert.equal(by_id.get("automation")!.description, "Key technology for automatic mass production.");
        assert.equal(by_id.get("space-science-pack")!.research_trigger!.type, profile === "base" ? "send-item-to-orbit" : "build-entity");
        const assets = new Set(nodes.flatMap((node) => [node.image_path,
            ...node.effects.flatMap((effect) => effect.image_path ? [effect.image_path] : []),
            ...(node.research_science?.science_packs.map((pack) => pack.image_path) ?? [])]));
        for (const asset of assets) {
            assert(asset.startsWith(`/data/${profile}/`));
            const bytes = await fs.readFile(path.join(process.cwd(), "public", asset));
            assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
            assert.equal(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
        }
        const layout = build_layout(nodes);
        assert.equal(Object.keys(layout.positions).length, nodes.length);
        assert(layout.group_columns.length > 0);
        assert(Object.values(layout.positions).every((position) => Number.isFinite(position.x) && Number.isFinite(position.y)));
    });
}

test("preserves the distinct base and Space Age progression", async () => {
    const base = await loadTechTree("base");
    const space_age = await loadTechTree("space-age");
    assert.equal(base.manifest.game_version, space_age.manifest.game_version);
    assert.equal(base.manifest.science_packs.length, 7);
    assert.equal(space_age.manifest.science_packs.length, 12);
    const base_nodes = new Map(base.nodes.map((node) => [node.id, node]));
    const space_age_nodes = new Map(space_age.nodes.map((node) => [node.id, node]));
    assert(base_nodes.has("mining-productivity-4"));
    assert(!space_age_nodes.has("mining-productivity-4"));
    assert(!base_nodes.has("planet-discovery-vulcanus"));
    assert(!base_nodes.has("quality-module"));
    assert.equal(base_nodes.get("rocket-silo")!.research_science!.science_packs.length, 5);
    assert.equal(space_age_nodes.get("rocket-silo")!.research_science!.science_packs.length, 3);
    assert.deepEqual(base_nodes.get("space-science-pack")!.prerequisites, ["rocket-silo"]);
    assert.deepEqual(space_age_nodes.get("space-science-pack")!.prerequisites, ["space-platform"]);
    assert.equal(base_nodes.get("cliff-explosives")!.research_science!.unit_count, 200);
    assert.equal(space_age_nodes.get("cliff-explosives")!.research_science!.unit_count, 500);
});

test("rejects unknown profiles, mismatched manifests, and mixed-profile assets", async () => {
    const { nodes, manifest } = await loadTechTree("base");
    for (const value of ["", "all", "../base", "quality", "constructor"]) {
        assert.throws(() => parse_game_profile(value), /Unsupported game profile/);
        await assert.rejects(loadTechTree(value as never), /Unsupported game profile/);
    }
    assert.throws(() => validate_manifest(manifest, nodes, "space-age"), /manifest/);
    assert.throws(() => validate_manifest({ ...manifest, mods: [...manifest.mods, { name: "quality", version: manifest.game_version }] }, nodes, "base"), /manifest/);
    assert.throws(() => validate_manifest({ ...manifest, science_packs: manifest.science_packs.map((pack) => ({ ...pack, image_path: pack.image_path.replace("/base/", "/space-age/") })) }, nodes, "base"), /metadata/);
    assert.throws(() => validate_nodes(nodes, "space-age"), /icon/);
    const mixed = structuredClone(nodes);
    const pack = mixed.find((node) => node.research_science)!.research_science!.science_packs[0];
    pack.image_path = pack.image_path.replace("/base/", "/space-age/");
    assert.throws(() => validate_nodes(mixed, "base"), /mixed-profile icon/);
    assert.throws(() => validate_manifest(manifest, mixed, "base"), /Mismatched science-pack/);
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
