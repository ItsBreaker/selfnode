import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cspFor, withMetaCsp } from "./site-csp.js";
import { swarmCid } from "./swarm.js";

const headers = readFileSync(new URL("../../apps/web/public/_headers", import.meta.url), "utf8");

describe("Swarm web mirror", () => {
  it("takes each page's CSP from _headers and drops frame-ancestors (meta can't set it)", () => {
    const main = cspFor(headers, "/*");
    expect(main).toContain("script-src 'self' 'wasm-unsafe-eval'");
    const html = withMetaCsp(
      '<!doctype html><html><head><meta charset="utf-8" /><title>x</title>',
      main,
    );
    expect(html).toMatch(/<meta charset="utf-8" \/><meta http-equiv="Content-Security-Policy"/);
    expect(html).not.toContain("frame-ancestors");
    expect(html).toContain('<meta name="referrer" content="no-referrer" />');
    const sandbox = cspFor(headers, "/anon-rpc-iframe.html");
    expect(sandbox).toContain("worker-src blob: data:");
    expect(
      withMetaCsp('<!doctype html><meta charset="utf-8"><script src="/a.js"></script>', sandbox),
    ).toMatch(
      /^<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' blob:/,
    );
  });
  it("refuses pages it can't protect, or that already have a meta CSP", () => {
    expect(() => withMetaCsp("<html><head></head>", "default-src 'none'")).toThrow(/meta charset/);
    expect(() =>
      withMetaCsp(
        '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="x">',
        "y",
      ),
    ).toThrow(/already/);
  });
  it("computes the base32 CID bzz.limo serves the site under", () => {
    // The reference and CID from the first upload, which bzz.limo served at https://<cid>.bzz.limo/.
    expect(swarmCid("228d4baa337dd0d27c2cea3d9858c2397ebeec8d88874949fce868cecff7400d")).toBe(
      "bah5acgzaekguxkrtpxine7bm5i6zqwgchf7l53enrcdussp45bum5t7xiagq",
    );
  });
});
