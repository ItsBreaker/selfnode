import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headersFor, parseHeaders } from "./headers";

// The real file the website and the desktop app both serve.
const rules = parseHeaders(
  readFileSync(new URL("../../web/public/_headers", import.meta.url), "utf8"),
);

describe("desktop serves the website's security headers", () => {
  it("applies the strict CSP and frame protection to app pages", () => {
    const h = headersFor(rules, "/explore");
    expect(h["Content-Security-Policy"]).toContain("default-src 'none'");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).not.toContain("unsafe-inline");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
  });
  it("gives the Anon-RPC sandbox page its own CSP and lets our page frame it", () => {
    const h = headersFor(rules, "/anon-rpc-iframe.html");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'self'");
    expect(h["Content-Security-Policy"]).toContain("worker-src blob: data:");
    expect(h["X-Frame-Options"]).toBeUndefined();
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });
});
