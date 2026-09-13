import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { game_profiles, type GameProfile } from "../app/lib/tech-tree/profiles";
import { export_hashes, locale_kinds, sha256, type ExportSource } from "./export";
import { generate_profile } from "./generate";

async function fixture(root: string, profile: GameProfile) {
    const cache = path.join(root, ".cache", "factorio-export", profile);
    const output = path.join(cache, "user-data", "script-output");
    await fs.mkdir(output, { recursive: true });
    const raw = {
        technology: {
            "automation-science-pack": { name: "automation-science-pack", type: "technology",
                research_trigger: { type: "craft-item", item: "lab" }, effects: {} },
            automation: { name: "automation", type: "technology", prerequisites: ["automation-science-pack"],
                unit: { count: profile === "base" ? 10 : 20, time: 10, ingredients: [["automation-science-pack", 1]] },
                effects: [{ type: "unlock-recipe", recipe: "assembling-machine-1" }] },
        },
        tool: { "automation-science-pack": { name: "automation-science-pack" } },
        recipe: { "assembling-machine-1": { name: "assembling-machine-1" } },
    };
    await fs.writeFile(path.join(output, "data-raw-dump.json"), JSON.stringify(raw));
    await fs.writeFile(path.join(output, "mod-settings-dump.json"), "{}");
    for (const kind of locale_kinds) {
        await fs.writeFile(path.join(output, `${kind}-locale.json`), JSON.stringify({
            names: { "automation-science-pack": "Automation science pack", automation: "Automation", lab: "Lab", "assembling-machine-1": "Assembling machine 1" },
            descriptions: { "automation-science-pack": "Unlock automation science." },
        }));
    }
    for (const icon of ["technology/automation-science-pack.png", "technology/automation.png", "item/automation-science-pack.png", "recipe/assembling-machine-1.png"]) {
        await fs.mkdir(path.dirname(path.join(output, icon)), { recursive: true });
        await fs.copyFile(path.join(process.cwd(), "public/data/space-age", icon), path.join(output, icon));
    }
    const source: ExportSource = {
        game_version: "2.0.0", profile, locale: "en", startup_settings: {},
        mods: game_profiles[profile].mods.map((name) => ({ name, version: "2.0.0" })),
        source_hashes: await export_hashes(output),
    };
    const source_path = path.join(cache, "source.json");
    await fs.writeFile(source_path, JSON.stringify(source));
    return { output, source, source_path };
}

async function snapshot(directory: string): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const location = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            for (const [name, hash] of Object.entries(await snapshot(location))) files[`${entry.name}/${name}`] = hash;
        } else files[entry.name] = sha256(await fs.readFile(location));
    }
    return files;
}

test("publishes isolated, deterministic profiles and rejects invalid exports before publishing", async (t) => {
    const scratch = path.join(process.cwd(), ".cache", "factorio-export");
    await fs.mkdir(scratch, { recursive: true });
    const root = await fs.mkdtemp(path.join(scratch, "generate-test-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fixture(root, "space-age");
    const { output, source, source_path } = await fixture(root, "base");
    const generate = (profile: GameProfile) => generate_profile(root, "/no-factorio-required", profile, true);
    await generate("space-age");
    const space_age_assets = await snapshot(path.join(root, "public/data/space-age"));
    await generate("base");
    assert.deepEqual(await snapshot(path.join(root, "public/data/space-age")), space_age_assets);
    assert.deepEqual(await fs.readdir(path.join(root, "public/data/base/quality")), []);
    assert.deepEqual(await fs.readdir(path.join(root, "public/data/base/space-location")), []);
    const data = await snapshot(path.join(root, "data"));
    const assets = await snapshot(path.join(root, "public"));
    await fs.writeFile(path.join(root, "public/data/base/technology/stale.png"), "stale");
    await generate("base");
    await generate("space-age");
    assert.deepEqual(await snapshot(path.join(root, "data")), data);
    assert.deepEqual(await snapshot(path.join(root, "public")), assets);

    for (const invalid of [
        { ...source, profile: "space-age" },
        { ...source, mods: [...source.mods, { name: "quality", version: source.game_version }] },
        { ...source, game_version: "2.0.1" },
        { ...source, source_hashes: {} },
        { ...source, startup_settings: { changed: true } },
    ]) {
        await fs.writeFile(source_path, JSON.stringify(invalid));
        await assert.rejects(generate("base"), /Cached exports do not match/);
    }
    await fs.writeFile(source_path, JSON.stringify(source));
    await fs.writeFile(path.join(output, "technology/automation.png"), "invalid png");
    await assert.rejects(generate("base"), /Invalid or undersized icon/);
    assert.deepEqual(await snapshot(path.join(root, "data")), data);
    assert.deepEqual(await snapshot(path.join(root, "public")), assets);
});
