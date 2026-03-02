"use client";

import { useEffect, useMemo, useState } from "react";
import { FiMonitor, FiMoon, FiSun } from "react-icons/fi";

type ThemeMode = "system" | "light" | "dark";

const storage_key = "theme_mode";

const theme_options: {
    id: ThemeMode;
    label: string;
    Icon: typeof FiSun;
}[] = [
    { id: "system", label: "System", Icon: FiMonitor },
    { id: "light", label: "Light", Icon: FiSun },
    { id: "dark", label: "Dark", Icon: FiMoon },
];

export default function ThemeToggle() {
    const [theme, set_theme] = useState<ThemeMode>("system");

    useEffect(() => {
        const stored = window.localStorage.getItem(storage_key);
        if (stored === "system" || stored === "light" || stored === "dark") {
            set_theme(stored);
        }
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        const body = document.body;
        root.setAttribute("data-theme", theme);
        if (body) {
            body.setAttribute("data-theme", theme);
        }
        window.localStorage.setItem(storage_key, theme);
    }, [theme]);

    const current_label = useMemo(() => {
        return theme_options.find((option) => option.id === theme)?.label ?? "System";
    }, [theme]);

    return (
        <div
            className="graph-theme-toggle"
            role="group"
            aria-label={`Theme: ${current_label}`}
            data-no-pan
            data-no-zoom
        >
            {theme_options.map((option) => {
                const is_active = option.id === theme;
                return (
                    <button
                        key={option.id}
                        type="button"
                        className={`graph-theme-option${is_active ? " is-active" : ""}`}
                        aria-pressed={is_active}
                        aria-label={option.label}
                        title={option.label}
                        onClick={() => {
                            set_theme(option.id);
                        }}
                    >
                        <option.Icon aria-hidden />
                    </button>
                );
            })}
        </div>
    );
}
