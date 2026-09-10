import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { DataManifest } from "../app/lib/tech-tree/types";

export const profile_mods = ["base", "elevated-rails", "quality", "space-age"];
export const locale_kinds = ["technology", "recipe", "item", "entity", "fluid", "quality", "space-location", "ammo-category"];
export type ExportSource = Pick<DataManifest, "game_version" | "profile" | "locale" | "mods" | "startup_settings" | "source_hashes">;

export function sha256(data: string | Buffer) {
    return createHash("sha256").update(data).digest("hex");
}

export async function export_hashes(output: string) {
    const names = ["data-raw-dump.json", "mod-settings-dump.json", ...locale_kinds.map((kind) => `${kind}-locale.json`)];
    return Object.fromEntries(await Promise.all(names.map(async (name) => [name, sha256(await fs.readFile(path.join(output, name)))])));
}

export async function export_game(binary: string, cache: string, reuse: boolean): Promise<ExportSource> {
    const output = path.join(cache, "user-data", "script-output");
    const source_path = path.join(cache, "source.json");
    if (reuse) {
        const source: ExportSource = JSON.parse(await fs.readFile(source_path, "utf8"));
        if (source.profile !== "space-age" || source.locale !== "en" ||
            source.mods.map((mod) => mod.name).join() !== profile_mods.join() ||
            JSON.stringify(source.source_hashes) !== JSON.stringify(await export_hashes(output))) {
            throw new Error("Cached exports do not match the English Space Age profile. Run without --reuse-exports.");
        }
        return source;
    }
    await fs.access(binary, fs.constants.X_OK);
    const data_path = path.resolve(path.dirname(binary), "../data");
    const mods = await Promise.all(profile_mods.map(async (name) => {
        const info = JSON.parse(await fs.readFile(path.join(data_path, name, "info.json"), "utf8"));
        if (info.name !== name || typeof info.version !== "string") throw new Error(`Invalid bundled mod: ${name}`);
        return { name, version: info.version as string };
    }));
    const version = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 10_000 });
    const game_version = /Version: (\d+\.\d+\.\d+)/.exec(version.stdout ?? "")?.[1];
    if (version.status !== 0 || !game_version || mods.some((mod) => mod.version !== game_version)) {
        throw new Error("The executable and bundled Space Age data must have matching versions.");
    }
    await fs.mkdir(path.join(cache, "mods"), { recursive: true });
    await fs.writeFile(path.join(cache, "mods", "mod-list.json"), JSON.stringify({
        mods: profile_mods.map((name) => ({ name, enabled: true })),
    }, null, 2) + "\n");
    await fs.rm(path.join(cache, "mods", "mod-settings.dat"), { force: true });
    const config_path = path.join(cache, "config.ini");
    await fs.writeFile(config_path, [
        "[path]", `read-data=${data_path}`, `write-data=${path.join(cache, "user-data")}`,
        "", "[general]", "locale=en", "", "[other]", "check-updates=false",
        "", "[graphics]", "full-screen=false", "",
    ].join("\n"));
    // Keep Steam's restart handoff from detaching the export process.
    await fs.writeFile(path.join(cache, "steam_appid.txt"), "427520\n");
    await fs.rm(source_path, { force: true });
    await fs.rm(output, { recursive: true, force: true });
    for (const flag of ["dump-data", "dump-prototype-locale", "dump-icon-sprites"]) {
        console.log(`Factorio ${game_version}: ${flag}`);
        const result = spawnSync(binary, [
            "--config", config_path, "--mod-directory", path.join(cache, "mods"),
            "--disable-audio", `--${flag}`,
        ], { cwd: cache, encoding: "utf8", timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
        await fs.writeFile(path.join(cache, `${flag}.log`), (result.stdout ?? "") + (result.stderr ?? ""));
        if (result.error || result.status !== 0) {
            throw new Error(`${flag} failed (${result.error?.message ?? result.status}). See ${path.join(cache, `${flag}.log`)}`);
        }
        const loaded_mods = [...result.stdout.matchAll(/Loading mod ([\w-]+) [\d.]+ \(data.lua\)/g)].map((match) => match[1]);
        if (loaded_mods.join() !== ["core", ...profile_mods].join()) {
            throw new Error(`${flag} did not load exactly the bundled Space Age profile. See its export log.`);
        }
    }
    const startup_settings = JSON.parse(await fs.readFile(path.join(output, "mod-settings-dump.json"), "utf8"));
    if (Object.keys(startup_settings).length) throw new Error("Unexpected startup settings in the unmodded export.");
    const source: ExportSource = {
        game_version, profile: "space-age", locale: "en", mods, startup_settings: {},
        source_hashes: await export_hashes(output),
    };
    await fs.writeFile(source_path, JSON.stringify(source, null, 2) + "\n");
    return source;
}
