"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

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

function get_depth_mode(): DepthMode {
    return window.localStorage.getItem("depth_mode") === "ancestors" ? "ancestors" : "direct";
}

function get_server_depth_mode(): DepthMode {
    return "direct";
}

function subscribe_depth_mode(on_change: () => void) {
    window.addEventListener("storage", on_change);
    window.addEventListener("depth-mode-change", on_change);
    return () => {
        window.removeEventListener("storage", on_change);
        window.removeEventListener("depth-mode-change", on_change);
    };
}

function set_depth_mode(mode: DepthMode) {
    window.localStorage.setItem("depth_mode", mode);
    // Native storage events only notify other tabs.
    window.dispatchEvent(new Event("depth-mode-change"));
}

export function useFilterState(all_filter_ids: Set<string>): UseFilterStateResult {
    const [active_filters, set_active_filters] = useState<Set<string>>(
        () => new Set(all_filter_ids),
    );
    const [search_query, set_search_query] = useState("");
    const depth_mode = useSyncExternalStore(
        subscribe_depth_mode,
        get_depth_mode,
        get_server_depth_mode,
    );

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
