/** The production CSPs, as <meta> tags, for the Swarm-hosted copy (pure; tested). */
/** Insert the policy right after <meta charset> so it applies before any script. */
export function withMetaCsp(html: string, policy: string): string {
  if (html.includes('http-equiv="Content-Security-Policy"'))
    throw new Error("already has a meta CSP");
  const tags =
    `<meta http-equiv="Content-Security-Policy" content="${policy.replace(/;\s*frame-ancestors [^;]+/, "")}" />` +
    `<meta name="referrer" content="no-referrer" />`;
  const out = html.replace(/(<meta charset="utf-8"\s*\/?>)/i, `$1${tags}`);
  if (out === html) throw new Error("no <meta charset> to insert after");
  return out;
}

export function cspFor(headers: string, block: string): string {
  const b = headers.split(/\n(?=\S)/).find((x) => x.startsWith(`${block}\n`));
  const m = b?.match(/^\s+Content-Security-Policy: (.+)$/m);
  if (!m?.[1]) throw new Error(`no CSP for ${block} in _headers`);
  return m[1];
}
