import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { DataManifest } from "../app/lib/tech-tree/types";
import { export_game, locale_kinds, sha256 } from "./export";
import { normalize_data } from "./normalize";
import type { Locales, RawData } from "./types";

const root = fileURLToPath(new URL("../", import.meta.url));
const cache = path.join(root, ".cache", "factorio-export");
const default_binary = path.join(os.homedir(), "Library/Application Support/Steam/steamapps/common/Factorio/factorio.app/Contents/MacOS/factorio");

async function main() {
    const { values } = parseArgs({ options: {
        factorio: { type: "string", default: process.env.FACTORIO_BIN ?? default_binary },
        "reuse-exports": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
    } });
    if (values.help) {
        console.log("Usage: npm run data:generate -- [--factorio /path/to/factorio] [--reuse-exports]\nExports unmodded Factorio + Space Age in English. Saves and personal mod settings are never accessed.");
        return;
    }
    const source = await export_game(path.resolve(values.factorio), cache, values["reuse-exports"]);
    const output = path.join(cache, "user-data", "script-output");
    const raw: RawData = JSON.parse(await fs.readFile(path.join(output, "data-raw-dump.json"), "utf8"));
    const locales: Locales = Object.fromEntries(await Promise.all(locale_kinds.map(async (kind) => [
        kind, JSON.parse(await fs.readFile(path.join(output, `${kind}-locale.json`), "utf8")),
    ])));
    const { nodes, science_packs } = normalize_data(raw, locales);
    const assets = new Set([
        ...nodes.map((node) => node.image_path),
        ...science_packs.map((pack) => pack.image_path),
        ...nodes.flatMap((node) => node.effects.flatMap((effect) => effect.image_path ? [effect.image_path] : [])),
    ]);
    const staging = path.join(cache, "publish");
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(staging, { recursive: true });
    const asset_hashes: string[] = [];
    for (const asset of [...assets].sort()) {
        if (!/^\/data\/(technology|item|recipe|quality|space-location)\/[a-z0-9_-]+\.png$/.test(asset)) {
            throw new Error(`Invalid asset path: ${asset}`);
        }
        const relative = asset.slice("/data/".length);
        const bytes = await fs.readFile(path.join(output, relative));
        const minimum = asset.startsWith("/data/technology/") ? 256 : 64;
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
    const jsonl = nodes.map((node) => JSON.stringify(node)).join("\n") + "\n";
    await fs.writeFile(path.join(staging, "tech_tree.jsonl"), jsonl);
    await fs.writeFile(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

    // Publish only after the complete dataset and every referenced icon pass validation.
    await fs.mkdir(path.join(root, "public", "data"), { recursive: true });
    await fs.mkdir(path.join(root, "data"), { recursive: true });
    for (const kind of ["technology", "item", "recipe", "quality", "space-location"]) {
        const destination = path.join(root, "public", "data", kind);
        await fs.cp(path.join(staging, kind), destination, { recursive: true });
        for (const file of await fs.readdir(destination)) {
            if (!assets.has(`/data/${kind}/${file}`)) await fs.rm(path.join(destination, file));
        }
    }
    for (const name of ["tech_tree.jsonl", "manifest.json"]) {
        await fs.rename(path.join(staging, name), path.join(root, "data", name));
    }
    console.log(`Published ${nodes.length} technologies, ${assets.size} icons, and descriptions for every research (${manifest.locale_description_count} from game text; ${manifest.effect_description_count} from effects).`);
}

main().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
});
