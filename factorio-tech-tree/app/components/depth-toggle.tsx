"use client";

import { FiArrowUp, FiChevronsUp } from "react-icons/fi";

export type DepthMode = "direct" | "ancestors";

type DepthOption = {
    id: DepthMode;
    label: string;
    Icon: typeof FiArrowUp;
};

const depth_options: DepthOption[] = [
    { id: "direct", label: "Immediate prerequisites only", Icon: FiArrowUp },
    { id: "ancestors", label: "All required research", Icon: FiChevronsUp },
];

type DepthToggleProps = {
    mode: DepthMode;
    on_change: (mode: DepthMode) => void;
};

export default function DepthToggle({ mode, on_change }: DepthToggleProps) {
    return (
        <div
            className="graph-theme-toggle"
            role="group"
            aria-label={`Highlight depth: ${mode}`}
            data-no-pan
            data-no-zoom
        >
            {depth_options.map((option) => {
                const is_active = option.id === mode;
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
