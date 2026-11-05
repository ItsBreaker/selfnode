import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Parse `--name: #hex` (and var() aliases) per theme block from tokens.css. */
function parseThemes(css: string): Record<"light" | "dark", Record<string, string>> {
  const block = (selector: RegExp) => {
    const m = css.match(selector);
    if (!m?.[1]) throw new Error(`theme block not found: ${selector}`);
    const vars: Record<string, string> = {};
    for (const [, k, v] of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) if (k && v) vars[k] = v.trim();
    return vars;
  };
  const light = block(/\[data-theme="light"\]\s*\{([^}]*)\}/);
  const dark = { ...light, ...block(/\[data-theme="dark"\]\s*\{([^}]*)\}/) };
  const resolve = (t: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(t).map(([k, v]) => [
        k,
        v.replace(/var\(--([\w-]+)\)/, (_, r: string) => t[r] ?? v),
      ]),
    );
  return { light: resolve(light), dark: resolve(dark) };
}

const lum = (hex: string) => {
  const c = (hex.replace("#", "").match(/\w\w/g) ?? []).map((h) => parseInt(h, 16) / 255);
  const [r = 0, g = 0, b = 0] = c.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const themes = parseThemes(css);

// [foreground, background, minimum]. 4.5 = AA body text; 3 = UI component boundaries.
const PAIRS: [string, string, number][] = [
  ["text", "bg", 4.5],
  ["text", "surface", 4.5],
  ["text", "sunken", 4.5],
  ["muted", "bg", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "sunken", 4.5],
  ["accent", "bg", 4.5],
  ["accent", "surface", 4.5],
  ["on-accent", "accent", 4.5],
  ["on-accent", "accent-hover", 4.5],
  ["private", "private-soft", 4.5],
  ["verified", "verified-soft", 4.5],
  ["verified", "surface", 4.5],
  ["warning", "warning-soft", 4.5],
  ["warning", "surface", 4.5],
  ["danger", "danger-soft", 4.5],
  ["danger", "surface", 4.5],
  ["on-danger", "danger", 4.5],
  ["mynode", "mynode-soft", 4.5],
  ["mynode", "surface", 4.5],
  ["border-strong", "surface", 3],
  ["border-strong", "bg", 3],
  ["focus", "bg", 3],
  ["focus", "surface", 3],
];

describe("design tokens meet WCAG AA", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const [fg, bg, min] of PAIRS) {
      it(`${theme}: ${fg} on ${bg} ≥ ${min}`, () => {
        const t = themes[theme];
        expect(t[fg], `missing --${fg}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(t[bg], `missing --${bg}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(ratio(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(min);
      });
    }
  }
});
