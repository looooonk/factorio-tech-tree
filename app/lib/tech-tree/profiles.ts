export const game_profiles = {
    "space-age": { label: "Space Age", mods: ["base", "elevated-rails", "quality", "space-age"] },
    base: { label: "Base game", mods: ["base"] },
};

export type GameProfile = keyof typeof game_profiles;

export function parse_game_profile(value: string): GameProfile {
    if (value !== "base" && value !== "space-age") throw new Error(`Unsupported game profile: ${value}`);
    return value;
}
