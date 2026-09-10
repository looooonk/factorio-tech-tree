import type { ResearchEffect, ResearchTrigger } from "../app/lib/tech-tree/types";

export type RawTechnology = {
    type: "technology";
    name: string;
    prerequisites?: string[];
    max_level?: number | "infinite";
    upgrade?: boolean;
    hidden?: boolean;
    enabled?: boolean;
    visible_when_disabled?: boolean;
    ignore_tech_cost_multiplier?: boolean;
    unit?: {
        time: number;
        count?: number;
        count_formula?: string;
        ingredients: [string, number][];
    };
    research_trigger?: ResearchTrigger;
    effects?: Omit<ResearchEffect, "description" | "image_path">[];
};

export type RawData = {
    technology: Record<string, RawTechnology>;
    tool: Record<string, { name: string; order?: string }>;
    recipe: Record<string, { name: string }>;
};

export type PrototypeLocale = {
    names: Record<string, string>;
    descriptions: Record<string, string>;
};

export type Locales = Record<string, PrototypeLocale>;
