"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import type { Transform } from "../lib/tech-graph/types";
import { max_zoom, min_zoom, pan_boundary } from "../lib/tech-graph/constants";
import { clamp } from "../lib/tech-graph/utils";

type UsePanZoomOptions = {
    /** Returns the current layout dimensions; called inside fit_to_view. */
    get_layout_size: () => { width: number; height: number };
    /**
     * Called when a pointer-up occurs without a preceding drag, i.e. a bare
     * canvas click. Callers use this to deselect the active node.
     */
    on_canvas_click?: () => void;
};

type UsePanZoomResult = {
    container_ref: React.RefObject<HTMLDivElement | null>;
    viewport_ref: React.RefObject<HTMLDivElement | null>;
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

function constrain_axis(position: number, content_size: number, viewport_size: number) {
    const boundary = Math.min(pan_boundary, viewport_size * 0.4);
    const opposite_edge = viewport_size - content_size - boundary;
    return clamp(position, Math.min(boundary, opposite_edge), Math.max(boundary, opposite_edge));
}

/**
 * Manages all pan/zoom interaction state for the graph canvas.
 *
 * Handles mouse-wheel zoom anchored at the cursor position, click-drag panning,
 * smooth focus animations, and fit-to-view on mount/resize.
 */
export function usePanZoom({
    get_layout_size,
    on_canvas_click,
}: UsePanZoomOptions): UsePanZoomResult {
    const container_ref = useRef<HTMLDivElement | null>(null);
    const viewport_ref = useRef<HTMLDivElement | null>(null);
    const transform_ref = useRef<Transform>({ x: 0, y: 0, scale: 1 });
    const viewport_size_ref = useRef({ width: 0, height: 0 });
    const pointer_ref = useRef<{ x: number; y: number } | null>(null);
    const dragged_ref = useRef(false);
    const transform_frame_ref = useRef<number | null>(null);
    const focus_animation_ref = useRef<number | null>(null);
    // Stable ref so on_pointer_up doesn't need on_canvas_click in its dep array.
    const on_canvas_click_ref = useRef(on_canvas_click);
    useEffect(() => {
        on_canvas_click_ref.current = on_canvas_click;
    }, [on_canvas_click]);

    const cancel_focus_animation = useCallback(() => {
        if (focus_animation_ref.current === null) return;
        cancelAnimationFrame(focus_animation_ref.current);
        focus_animation_ref.current = null;
    }, []);

    const cancel_transform_frame = useCallback(() => {
        if (transform_frame_ref.current === null) return;
        cancelAnimationFrame(transform_frame_ref.current);
        transform_frame_ref.current = null;
    }, []);

    const constrain_transform = useCallback((transform: Transform) => {
        const viewport = viewport_size_ref.current;
        if (viewport.width === 0 || viewport.height === 0) return transform;
        const layout = get_layout_size();
        return {
            ...transform,
            x: constrain_axis(transform.x, layout.width * transform.scale, viewport.width),
            y: constrain_axis(transform.y, layout.height * transform.scale, viewport.height),
        };
    }, [get_layout_size]);

    const write_transform = useCallback((transform: Transform) => {
        const constrained = constrain_transform(transform);
        transform_ref.current = constrained;
        if (!viewport_ref.current) return;
        viewport_ref.current.style.transform =
            `translate3d(${constrained.x}px, ${constrained.y}px, 0) scale(${constrained.scale})`;
    }, [constrain_transform]);

    const schedule_transform = useCallback((transform: Transform) => {
        transform_ref.current = constrain_transform(transform);
        if (transform_frame_ref.current !== null) return;
        transform_frame_ref.current = requestAnimationFrame(() => {
            transform_frame_ref.current = null;
            write_transform(transform_ref.current);
        });
    }, [constrain_transform, write_transform]);

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
            const current = transform_ref.current;
            const scale = clamp(next_scale, min_zoom, max_zoom);
            const ratio = scale / current.scale;
            schedule_transform({
                scale,
                x: anchor.x - (anchor.x - current.x) * ratio,
                y: anchor.y - (anchor.y - current.y) * ratio,
            });
        },
        [cancel_focus_animation, container_ref, schedule_transform],
    );

    const fit_to_view = useCallback(() => {
        const container = container_ref.current;
        if (!container) return;
        const { width, height } = container.getBoundingClientRect();
        if (width === 0 || height === 0) return;
        viewport_size_ref.current = { width, height };
        const layout = get_layout_size();
        const scale = clamp(
            Math.min(width / layout.width, height / layout.height, 1),
            min_zoom,
            max_zoom,
        );
        const x = (width - layout.width * scale) / 2;
        const y = (height - layout.height * scale) / 2;
        cancel_focus_animation();
        cancel_transform_frame();
        write_transform({ x, y, scale });
    }, [
        cancel_focus_animation,
        cancel_transform_frame,
        container_ref,
        get_layout_size,
        write_transform,
    ]);

    useLayoutEffect(() => {
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
            cancel_transform_frame();
            const duration_ms = 440;
            const start_time = performance.now();
            const animate = (now: number) => {
                const elapsed = now - start_time;
                const progress = Math.min(1, elapsed / duration_ms);
                // Cubic ease-out: snappy start, smooth deceleration into the target.
                const eased = 1 - Math.pow(1 - progress, 3);
                write_transform({
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
        [cancel_focus_animation, cancel_transform_frame, container_ref, write_transform],
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
            event.preventDefault();
            cancel_focus_animation();
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.classList.add("is-panning");
            pointer_ref.current = { x: event.clientX, y: event.clientY };
            dragged_ref.current = false;
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
            const current = transform_ref.current;
            schedule_transform({ ...current, x: current.x + dx, y: current.y + dy });
        },
        [schedule_transform],
    );

    const on_pointer_up = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!pointer_ref.current) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        event.currentTarget.classList.remove("is-panning");
        const was_dragging = dragged_ref.current;
        pointer_ref.current = null;
        dragged_ref.current = false;
        if (!was_dragging) {
            on_canvas_click_ref.current?.();
        }
    }, []);

    useEffect(() => {
        return () => {
            cancel_transform_frame();
            cancel_focus_animation();
        };
    }, [cancel_focus_animation, cancel_transform_frame]);

    return {
        container_ref,
        viewport_ref,
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
