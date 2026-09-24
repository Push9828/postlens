"use client";

import { useEffect, useState } from "react";

type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "postlens-theme";

function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === "system" || value === "light" || value === "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice>("system");

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem(STORAGE_KEY);
      if (isThemeChoice(savedTheme)) setTheme(savedTheme);
    } catch {
      // Keep the system theme when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.dataset.theme = theme;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The selection still applies for this page session.
    }
  }, [theme]);

  return (
    <label className="flex min-h-10 items-center gap-2 text-sm text-[var(--text-muted)]">
      <span>Theme</span>
      <select
        aria-label="Color theme"
        value={theme}
        onChange={(event) => setTheme(event.currentTarget.value as ThemeChoice)}
        className="min-h-10 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-sm font-medium text-[var(--text-primary)]"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
