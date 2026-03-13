"use client";

import { FiArrowDown, FiArrowRight } from "react-icons/fi";
import type { LayoutDirection } from "../lib/tech-graph/graph-layout";

type LayoutOption = {
    id: LayoutDirection;
    label: string;
    Icon: typeof FiArrowDown;
};

const layout_options: LayoutOption[] = [
    { id: "vertical", label: "Vertical layout", Icon: FiArrowDown },
    { id: "horizontal", label: "Horizontal layout", Icon: FiArrowRight },
];

type LayoutToggleProps = {
    direction: LayoutDirection;
    on_change: (direction: LayoutDirection) => void;
};

export default function LayoutToggle({ direction, on_change }: LayoutToggleProps) {
    return (
        <div
            className="graph-theme-toggle"
            role="group"
            aria-label={`Layout direction: ${direction}`}
            data-no-pan
            data-no-zoom
        >
            {layout_options.map((option) => {
                const is_active = option.id === direction;
                return (
                    <button
                        key={option.id}
                        type="button"
                        className={`graph-theme-option${is_active ? " is-active" : ""}`}
                        aria-pressed={is_active}
                        aria-label={option.label}
                        title={option.label}
                        onClick={() => {
                            on_change(option.id);
                        }}
                    >
                        <option.Icon aria-hidden />
                    </button>
                );
            })}
        </div>
    );
}
