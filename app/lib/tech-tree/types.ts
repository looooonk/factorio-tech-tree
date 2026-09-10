export type SciencePack = {
    id: string;
    name: string;
    image_path: string;
    technology_id: string;
    order: string;
};

export type ResearchSciencePack = SciencePack & { amount_per_unit: number };

export type ResearchScience = {
    time_seconds: number;
    unit_count: number | null;
    count_formula: string | null;
    science_packs: ResearchSciencePack[];
};

export type ResearchTrigger = {
    type: string;
    count?: number;
    item?: string;
    entity?: string;
    fluid?: string;
};

export type ResearchEffect = {
    type: string;
    description: string;
    image_path?: string;
    recipe?: string;
    ammo_category?: string;
    turret_id?: string;
    quality?: string;
    space_location?: string;
    modifier?: number | boolean;
    change?: number;
    hidden?: boolean;
    use_icon_overlay_constant?: boolean;
};

export type TechNode = {
    id: string;
    title: string;
    description: string;
    description_source: "locale" | "effects";
    image_path: string;
    prerequisites: string[];
    research_level: number;
    max_research_level: number | "infinite";
    research_family: string | null;
    is_infinite: boolean;
    hidden: boolean;
    enabled: boolean;
    visible_when_disabled: boolean;
    ignore_tech_cost_multiplier: boolean;
    research_type: "science" | "condition";
    research_science: ResearchScience | null;
    research_trigger: ResearchTrigger | null;
    research_condition_text: string | null;
    effects: ResearchEffect[];
};

export type GraphNode = TechNode & { level: number };

export type GraphEdge = {
    id: string;
    from: string;
    to: string;
};

export type DataManifest = {
    schema_version: 1;
    game_version: string;
    profile: "space-age";
    locale: "en";
    mods: { name: string; version: string }[];
    startup_settings: Record<string, never>;
    source_hashes: Record<string, string>;
    technology_count: number;
    locale_description_count: number;
    effect_description_count: number;
    science_packs: SciencePack[];
};

export type TechTreeData = {
    nodes: GraphNode[];
    edges: GraphEdge[];
    root_ids: string[];
    max_level: number;
    manifest: DataManifest;
};
