"use client";

import { useCallback, useEffect, useState } from "react";

import type { DepthMode } from "../components/depth-toggle";

type UseFilterStateResult = {
    active_filters: Set<string>;
    toggle_filter: (filter_id: string) => void;
    select_all_filters: () => void;
    deselect_all_filters: () => void;
    search_query: string;
    set_search_query: (query: string) => void;
    depth_mode: DepthMode;
    set_depth_mode: (mode: DepthMode) => void;
};

/**
 * Manages filter panel state: active science-pack filters, search query, and
 * depth-mode toggle. Depth mode is persisted to localStorage so it survives
 * page reloads.
 */
export function use_filter_state(all_filter_ids: Set<string>): UseFilterStateResult {
    const [active_filters, set_active_filters] = useState<Set<string>>(
        () => new Set(all_filter_ids),
    );
    const [search_query, set_search_query] = useState("");
    const [depth_mode, set_depth_mode] = useState<DepthMode>("direct");

    useEffect(() => {
        const stored = window.localStorage.getItem("depth_mode");
        if (stored === "direct" || stored === "ancestors") {
            set_depth_mode(stored);
        }
    }, []);

    useEffect(() => {
        window.localStorage.setItem("depth_mode", depth_mode);
    }, [depth_mode]);

    const toggle_filter = useCallback((filter_id: string) => {
        set_active_filters((current) => {
            const next = new Set(current);
            if (next.has(filter_id)) {
                next.delete(filter_id);
            } else {
                next.add(filter_id);
            }
            return next;
        });
    }, []);

    const select_all_filters = useCallback(() => {
        set_active_filters(new Set(all_filter_ids));
    }, [all_filter_ids]);

    const deselect_all_filters = useCallback(() => {
        set_active_filters(new Set());
    }, []);

    return {
        active_filters,
        toggle_filter,
        select_all_filters,
        deselect_all_filters,
        search_query,
        set_search_query,
        depth_mode,
        set_depth_mode,
    };
}
