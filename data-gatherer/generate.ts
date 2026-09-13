import fs from "node:fs/promises";
import path from "node:path";
import type { DataManifest } from "../app/lib/tech-tree/types";
import { parse_game_profile, type GameProfile } from "../app/lib/tech-tree/profiles";
import { validate_manifest } from "../app/lib/tech-tree/validate";
import { build_graph } from "../app/lib/tech-tree/load-tech-tree";
import { export_game, locale_kinds, sha256 } from "./export";
import { normalize_data } from "./normalize";
import type { Locales, RawData } from "./types";

export async function generate_profile(root: string, binary: string, profile: GameProfile, reuse: boolean) {
    const cache = path.join(root, ".cache", "factorio-export", parse_game_profile(profile));
    const source = await export_game(binary, cache, reuse, profile);
    const output = path.join(cache, "user-data", "script-output");
    const raw: RawData = JSON.parse(await fs.readFile(path.join(output, "data-raw-dump.json"), "utf8"));
    const locales: Locales = Object.fromEntries(await Promise.all(locale_kinds.map(async (kind) => [
        kind, JSON.parse(await fs.readFile(path.join(output, `${kind}-locale.json`), "utf8")),
    ])));
    const { nodes, science_packs } = normalize_data(raw, locales, profile);
    const assets = new Set([
        ...nodes.map((node) => node.image_path),
        ...science_packs.map((pack) => pack.image_path),
        ...nodes.flatMap((node) => node.effects.flatMap((effect) => effect.image_path ? [effect.image_path] : [])),
    ]);
    const asset_prefix = `/data/${profile}/`;
    const staging = path.join(cache, "publish");
    await fs.rm(staging, { recursive: true, force: true });
    const kinds = ["technology", "item", "recipe", "quality", "space-location"];
    for (const kind of kinds) await fs.mkdir(path.join(staging, kind), { recursive: true });
    const asset_hashes: string[] = [];
    for (const asset of [...assets].sort()) {
        const relative = asset.slice(asset_prefix.length);
        if (!asset.startsWith(asset_prefix) || !/^(technology|item|recipe|quality|space-location)\/[a-z0-9_-]+\.png$/.test(relative)) {
            throw new Error(`Invalid asset path: ${asset}`);
        }
        const bytes = await fs.readFile(path.join(output, relative));
        const minimum = relative.startsWith("technology/") ? 256 : 64;
        if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
            bytes.readUInt32BE(16) < minimum || bytes.readUInt32BE(16) !== bytes.readUInt32BE(20)) {
            throw new Error(`Invalid or undersized icon: ${asset}`);
        }
        const destination = path.join(staging, relative);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, bytes);
        asset_hashes.push(`${relative}:${sha256(bytes)}`);
    }
    const manifest: DataManifest = {
        schema_version: 1, ...source,
        source_hashes: { ...source.source_hashes, icons: sha256(asset_hashes.join("\n")) },
        technology_count: nodes.length,
        locale_description_count: nodes.filter((node) => node.description_source === "locale").length,
        effect_description_count: nodes.filter((node) => node.description_source === "effects").length,
        science_packs,
    };
    validate_manifest(manifest, nodes, profile);
    build_graph(nodes, profile);
    const jsonl = nodes.map((node) => JSON.stringify(node)).join("\n") + "\n";
    await fs.writeFile(path.join(staging, "tech_tree.jsonl"), jsonl);
    await fs.writeFile(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

    // Publish only after the complete dataset and every referenced icon pass validation.
    await fs.mkdir(path.join(root, "public", "data", profile), { recursive: true });
    await fs.mkdir(path.join(root, "data", profile), { recursive: true });
    for (const kind of kinds) {
        const destination = path.join(root, "public", "data", profile, kind);
        await fs.cp(path.join(staging, kind), destination, { recursive: true });
        for (const file of await fs.readdir(destination)) {
            if (!assets.has(`${asset_prefix}${kind}/${file}`)) await fs.rm(path.join(destination, file));
        }
    }
    for (const name of ["tech_tree.jsonl", "manifest.json"]) {
        await fs.rename(path.join(staging, name), path.join(root, "data", profile, name));
    }
    console.log(`Published ${profile}: ${nodes.length} technologies, ${assets.size} icons, and descriptions for every research (${manifest.locale_description_count} from game text; ${manifest.effect_description_count} from effects).`);
}
