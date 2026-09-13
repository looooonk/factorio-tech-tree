"use client";

import { useLayoutEffect, useRef, useState } from "react";
import TechGraph from "./tech-graph";
import type { GameProfile } from "./lib/tech-tree/profiles";
import type { TechTreeData } from "./lib/tech-tree/types";

export default function GameProfileGraph({ datasets }: { datasets: Record<GameProfile, TechTreeData> }) {
    const [profile, set_profile] = useState<GameProfile>("space-age");
    const profile_button_ref = useRef<HTMLButtonElement>(null);
    const restore_focus = useRef(false);
    const { nodes, edges, root_ids, manifest } = datasets[profile];

    useLayoutEffect(() => {
        if (restore_focus.current) profile_button_ref.current?.focus({ preventScroll: true });
    }, [profile]);

    return (
        <TechGraph
            key={profile}
            nodes={nodes}
            edges={edges}
            root_ids={root_ids}
            science_packs={manifest.science_packs}
            game_version={manifest.game_version}
            profile={profile}
            profile_button_ref={profile_button_ref}
            on_profile_change={(next_profile) => {
                restore_focus.current = true;
                set_profile(next_profile);
            }}
        />
    );
}
