"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Transform } from "../lib/tech-graph/types";
import { max_zoom, min_zoom } from "../lib/tech-graph/constants";
import { clamp } from "../lib/tech-graph/utils";

type UsePanZoomOptions = {
    /** Ref to the scrollable container element. */
    container_ref: React.RefObject<HTMLDivElement | null>;
    /** Returns the current layout dimensions; called inside fit_to_view. */
    get_layout_size: () => { width: number; height: number };
    /**
     * Called when a pointer-up occurs without a preceding drag, i.e. a bare
     * canvas click. Callers use this to deselect the active node.
     */
    on_canvas_click?: () => void;
};

type UsePanZoomResult = {
    transform: Transform;
    /** Mutable ref kept in sync with `transform`; safe to read in event handlers. */
    transform_ref: React.RefObject<Transform>;
    is_panning: boolean;
    cancel_focus_animation: () => void;
    update_zoom: (next_scale: number, anchor_x?: number, anchor_y?: number) => void;
    fit_to_view: () => void;
    on_zoom_in: () => void;
    on_zoom_out: () => void;
    /**
     * Animates the viewport pan so that `(center_x, center_y)` ends up centered
     * in the container. Does not change the scale.
     */
    animate_to: (center_x: number, center_y: number) => void;
    on_pointer_down: (event: React.PointerEvent<HTMLDivElement>) => void;
    on_pointer_move: (event: React.PointerEvent<HTMLDivElement>) => void;
    on_pointer_up: (event: React.PointerEvent<HTMLDivElement>) => void;
};

/**
 * Manages all pan/zoom interaction state for the graph canvas.
 *
 * Handles mouse-wheel zoom anchored at the cursor position, click-drag panning,
 * smooth focus animations, and fit-to-view on mount/resize.
 */
export function use_pan_zoom({
    container_ref,
    get_layout_size,
    on_canvas_click,
}: UsePanZoomOptions): UsePanZoomResult {
    const [transform, set_transform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
    const [is_panning, set_is_panning] = useState(false);
    const transform_ref = useRef<Transform>(transform);
    const pointer_ref = useRef<{ x: number; y: number } | null>(null);
    const dragged_ref = useRef(false);
    const focus_animation_ref = useRef<number | null>(null);
    // Stable ref so on_pointer_up doesn't need on_canvas_click in its dep array.
    const on_canvas_click_ref = useRef(on_canvas_click);
    useEffect(() => {
        on_canvas_click_ref.current = on_canvas_click;
    }, [on_canvas_click]);

    // Keep transform_ref in sync so event handlers can read the latest value
    // without capturing a stale closure.
    useEffect(() => {
        transform_ref.current = transform;
    }, [transform]);

    const cancel_focus_animation = useCallback(() => {
        if (focus_animation_ref.current === null) return;
        cancelAnimationFrame(focus_animation_ref.current);
        focus_animation_ref.current = null;
    }, []);

    const update_zoom = useCallback(
        (next_scale: number, anchor_x?: number, anchor_y?: number) => {
            const container = container_ref.current;
            if (!container) return;
            cancel_focus_animation();
            const rect = container.getBoundingClientRect();
            const anchor = {
                x: anchor_x ?? rect.width / 2,
                y: anchor_y ?? rect.height / 2,
            };
            set_transform((current) => {
                const scale = clamp(next_scale, min_zoom, max_zoom);
                const ratio = scale / current.scale;
                return {
                    scale,
                    x: anchor.x - (anchor.x - current.x) * ratio,
                    y: anchor.y - (anchor.y - current.y) * ratio,
                };
            });
        },
        [cancel_focus_animation, container_ref],
    );

    const fit_to_view = useCallback(() => {
        const container = container_ref.current;
        if (!container) return;
        const { width, height } = container.getBoundingClientRect();
        if (width === 0 || height === 0) return;
        const layout = get_layout_size();
        const scale = clamp(
            Math.min(width / layout.width, height / layout.height, 1),
            min_zoom,
            max_zoom,
        );
        const x = (width - layout.width * scale) / 2;
        const y = (height - layout.height * scale) / 2;
        cancel_focus_animation();
        set_transform({ x, y, scale });
    }, [cancel_focus_animation, container_ref, get_layout_size]);

    useEffect(() => {
        fit_to_view();
        window.addEventListener("resize", fit_to_view);
        return () => window.removeEventListener("resize", fit_to_view);
    }, [fit_to_view]);

    const animate_to = useCallback(
        (center_x: number, center_y: number) => {
            const container = container_ref.current;
            if (!container) return;
            const { width, height } = container.getBoundingClientRect();
            if (width === 0 || height === 0) return;
            const start = transform_ref.current;
            const target_x = width / 2 - center_x * start.scale;
            const target_y = height / 2 - center_y * start.scale;
            cancel_focus_animation();
            const duration_ms = 440;
            const start_time = performance.now();
            const animate = (now: number) => {
                const elapsed = now - start_time;
                const progress = Math.min(1, elapsed / duration_ms);
                // Cubic ease-out: snappy start, smooth deceleration into the target.
                const eased = 1 - Math.pow(1 - progress, 3);
                set_transform({
                    scale: start.scale,
                    x: start.x + (target_x - start.x) * eased,
                    y: start.y + (target_y - start.y) * eased,
                });
                if (progress < 1) {
                    focus_animation_ref.current = requestAnimationFrame(animate);
                    return;
                }
                focus_animation_ref.current = null;
            };
            focus_animation_ref.current = requestAnimationFrame(animate);
        },
        [cancel_focus_animation, container_ref],
    );

    const on_wheel = useCallback(
        (event: WheelEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest("[data-no-zoom]")) return;
            // Must call preventDefault to suppress native page scroll/zoom.
            event.preventDefault();
            const container = container_ref.current;
            if (!container) return;
            const zoom_factor = event.deltaY < 0 ? 1.08 : 0.92;
            const rect = container.getBoundingClientRect();
            const anchor_x = clamp(event.clientX - rect.left, 0, rect.width);
            const anchor_y = clamp(event.clientY - rect.top, 0, rect.height);
            update_zoom(transform_ref.current.scale * zoom_factor, anchor_x, anchor_y);
        },
        [container_ref, update_zoom],
    );

    useEffect(() => {
        const container = container_ref.current;
        if (!container) return;
        // Must be non-passive so we can call preventDefault.
        container.addEventListener("wheel", on_wheel, { passive: false });
        return () => container.removeEventListener("wheel", on_wheel);
    }, [container_ref, on_wheel]);

    const on_zoom_in = useCallback(
        () => update_zoom(transform_ref.current.scale * 1.12),
        [update_zoom],
    );
    const on_zoom_out = useCallback(
        () => update_zoom(transform_ref.current.scale * 0.88),
        [update_zoom],
    );

    const on_pointer_down = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (event.button !== 0) return;
            const target = event.target as HTMLElement;
            if (target.closest("[data-no-pan]")) return;
            cancel_focus_animation();
            event.currentTarget.setPointerCapture(event.pointerId);
            pointer_ref.current = { x: event.clientX, y: event.clientY };
            dragged_ref.current = false;
            set_is_panning(true);
        },
        [cancel_focus_animation],
    );

    const on_pointer_move = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (!pointer_ref.current) return;
            const dx = event.clientX - pointer_ref.current.x;
            const dy = event.clientY - pointer_ref.current.y;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                dragged_ref.current = true;
            }
            pointer_ref.current = { x: event.clientX, y: event.clientY };
            set_transform((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
        },
        [],
    );

    const on_pointer_up = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!pointer_ref.current) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        const was_dragging = dragged_ref.current;
        pointer_ref.current = null;
        dragged_ref.current = false;
        set_is_panning(false);
        if (!was_dragging) {
            on_canvas_click_ref.current?.();
        }
    }, []);

    return {
        transform,
        transform_ref,
        is_panning,
        cancel_focus_animation,
        update_zoom,
        fit_to_view,
        on_zoom_in,
        on_zoom_out,
        animate_to,
        on_pointer_down,
        on_pointer_move,
        on_pointer_up,
    };
}
