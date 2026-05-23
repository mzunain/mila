"use client";

import { useEffect } from "react";
import { usePreferences } from "@/lib/preferences";

export function ThemeController() {
  const { preferences, hydrated } = usePreferences();

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    const applyTheme = () => {
      const wantsSystem = preferences.theme === "system";
      const isDark = wantsSystem
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : preferences.theme === "dark";
      root.classList.toggle("dark", isDark);
      root.classList.toggle("light", !isDark);
      root.dataset.theme = isDark ? "dark" : "light";
    };

    applyTheme();

    if (preferences.theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", applyTheme);
      return () => mediaQuery.removeEventListener("change", applyTheme);
    }
    return undefined;
  }, [preferences.theme, hydrated]);

  return null;
}
