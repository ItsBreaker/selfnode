import { useCallback, useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";
export const THEME_KEY = "selfnode:theme";

export function readThemePref(): ThemePref {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

const systemTheme = (): Theme =>
  matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
export const resolveTheme = (pref: ThemePref): Theme => (pref === "system" ? systemTheme() : pref);

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** Respects the system preference until the user picks, then remembers the choice. */
export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readThemePref);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(pref));

  useEffect(() => {
    const apply = () => {
      const t = resolveTheme(pref);
      setTheme(t);
      applyTheme(t);
    };
    apply();
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    if (p === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, p);
    setPrefState(p);
  }, []);

  return { pref, theme, setPref };
}
