"use client";

import { useCallback, useEffect, useRef } from "react";

type UseHistoryNavigationOptions = {
    /** Called when navigation lands on a node; should select and focus it. */
    on_navigate: (node_id: string) => void;
};

type UseHistoryNavigationResult = {
    /**
     * Appends `node_id` to the navigation stack and advances the index.
     * If the current head already equals `node_id` the call is a no-op to
     * prevent duplicate entries when re-clicking the same node.
     * Truncates any forward history when called mid-stack.
     */
    record_history: (node_id: string) => void;
    navigate_history: (direction: "back" | "forward") => void;
};

/**
 * Manages a browser-style back/forward navigation stack over selected nodes.
 *
 * The stack is stored in a ref (not state) because navigation history changes
 * should not trigger re-renders on their own; only the resulting node selection
 * (via `on_navigate`) causes a render.
 *
 * Stack capacity is capped at 100 entries to bound memory usage.
 */
export function use_history_navigation({
    on_navigate,
}: UseHistoryNavigationOptions): UseHistoryNavigationResult {
    const history_ref = useRef<{ stack: string[]; index: number }>({
        stack: [],
        index: -1,
    });
    // Stable ref so navigate_history doesn't need on_navigate as a dep.
    const on_navigate_ref = useRef(on_navigate);
    useEffect(() => {
        on_navigate_ref.current = on_navigate;
    }, [on_navigate]);

    const record_history = useCallback((node_id: string) => {
        const history = history_ref.current;
        const { stack } = history;
        if (stack[history.index] === node_id) return;
        // Branching: discard any forward entries when a new selection is made.
        if (history.index < stack.length - 1) {
            stack.splice(history.index + 1);
        }
        stack.push(node_id);
        // Cap at 100 entries; trim from the front to preserve recency.
        if (stack.length > 100) {
            stack.splice(0, stack.length - 100);
        }
        history.index = stack.length - 1;
    }, []);

    const navigate_history = useCallback((direction: "back" | "forward") => {
        const history = history_ref.current;
        const next_index = direction === "back" ? history.index - 1 : history.index + 1;
        if (next_index < 0 || next_index >= history.stack.length) return;
        history.index = next_index;
        on_navigate_ref.current(history.stack[next_index]);
    }, []);

    useEffect(() => {
        const is_typing_target = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return false;
            if (target.isContentEditable) return true;
            return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
        };

        const on_key_down = (event: KeyboardEvent) => {
            if (event.defaultPrevented || is_typing_target(event.target)) return;
            if (event.key === "Backspace") {
                event.preventDefault();
                navigate_history("back");
                return;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                navigate_history("forward");
            }
        };

        window.addEventListener("keydown", on_key_down);
        return () => window.removeEventListener("keydown", on_key_down);
    }, [navigate_history]);

    return { record_history, navigate_history };
}
