export type TechNode = {
    id: string;
    title: string;
    url?: string;
    required_technologies?: string[];
    required_technologies_merged?: string[];
    image_path?: string;
    research_type?: string | null;
    research_science?: ResearchScience | null;
    research_condition_text?: string | null;
};

export type ResearchSciencePack = {
    name: string;
    amount_per_unit?: number | null;
    amount_text?: string | null;
};

export type ResearchScience = {
    time_seconds?: number | null;
    time_text?: string | null;
    unit_count?: number | null;
    unit_count_text?: string | null;
    science_packs: ResearchSciencePack[];
};

export type GraphNode = {
    id: string;
    title: string;
    url?: string | null;
    image_path?: string;
    prerequisites: string[];
    level: number;
    is_infinite: boolean;
    research_type?: string | null;
    research_science?: ResearchScience | null;
    research_condition_text?: string | null;
};

export type GraphEdge = {
    id: string;
    from: string;
    to: string;
    is_self_loop?: boolean;
};

export type TechTreeData = {
    nodes: GraphNode[];
    edges: GraphEdge[];
    root_ids: string[];
    max_level: number;
};
