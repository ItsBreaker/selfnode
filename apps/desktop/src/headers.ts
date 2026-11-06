/**
 * Parse the web build's `_headers` file (Cloudflare format) so the desktop
 * app serves exactly the same security headers as the website: one source of
 * truth, tested once. Supports path rules ("/*" or exact), "Name: value" and
 * "! Name" (remove a header set by an earlier matching rule).
 */
export interface HeaderRule {
  path: string;
  set: [string, string][];
  remove: string[];
}

export function parseHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let cur: HeaderRule | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      cur = { path: line.trim(), set: [], remove: [] };
      rules.push(cur);
      continue;
    }
    if (!cur) continue;
    const t = line.trim();
    if (t.startsWith("!")) cur.remove.push(t.slice(1).trim().toLowerCase());
    else {
      const i = t.indexOf(":");
      if (i > 0) cur.set.push([t.slice(0, i).trim(), t.slice(i + 1).trim()]);
    }
  }
  return rules;
}

const matches = (rule: string, path: string) =>
  rule === path || (rule.endsWith("/*") && path.startsWith(rule.slice(0, -1)));

export function headersFor(rules: HeaderRule[], path: string): Record<string, string> {
  const out = new Map<string, [string, string]>();
  for (const r of rules) {
    if (!matches(r.path, path)) continue;
    for (const name of r.remove) out.delete(name);
    for (const [k, v] of r.set) out.set(k.toLowerCase(), [k, v]);
  }
  return Object.fromEntries([...out.values()]);
}
