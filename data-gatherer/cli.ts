import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parse_game_profile, type GameProfile } from "../app/lib/tech-tree/profiles";
import { generate_profile } from "./generate";

const root = fileURLToPath(new URL("../", import.meta.url));
const default_binary = path.join(os.homedir(), "Library/Application Support/Steam/steamapps/common/Factorio/factorio.app/Contents/MacOS/factorio");

async function main() {
    const { values } = parseArgs({ options: {
        factorio: { type: "string", default: process.env.FACTORIO_BIN ?? default_binary },
        profile: { type: "string", default: "all" },
        "reuse-exports": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
    } });
    if (values.help) {
        console.log("Usage: npm run data:generate -- [--profile all|base|space-age] [--factorio /path/to/factorio] [--reuse-exports]\nExports both English game profiles by default. Saves and personal mod settings are never accessed.");
        return;
    }
    const profiles: GameProfile[] = values.profile === "all" ? ["space-age", "base"] : [parse_game_profile(values.profile)];
    for (const profile of profiles) {
        await generate_profile(root, path.resolve(values.factorio), profile, values["reuse-exports"]);
    }
}

main().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
});
