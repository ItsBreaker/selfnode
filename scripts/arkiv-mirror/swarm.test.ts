import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex, swarmDownload, swarmUpload } from "./swarm.js";

const REF = "b23b5b239161ba4f21ffaae70e8c52eb39f6db7d3055ee5d9ef175b738a6425e";
const good = new TextEncoder().encode('{"ok":true}');
const bad = new TextEncoder().encode('{"ok":false}');
const SHA = sha256Hex(good);

function mockFetch(byHost: Record<string, () => Response | Promise<Response>>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (url: string) => {
    calls.push(url);
    const host = new URL(url).host;
    const h = byHost[host];
    return h ? Promise.resolve(h()) : Promise.reject(new TypeError("fetch failed"));
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("swarmDownload", () => {
  it("uses the first gateway when it serves the right bytes", async () => {
    const calls = mockFetch({ "a.test": () => new Response(good) });
    const r = await swarmDownload(REF, SHA, ["https://a.test", "https://b.test"]);
    expect(r.gateway).toBe("https://a.test");
    expect(r.failures).toEqual([]);
    expect(calls).toEqual([`https://a.test/bzz/${REF}/`]);
  });

  it("falls back when a gateway is down or returns an error", async () => {
    mockFetch({
      "b.test": () => new Response("nope", { status: 404 }),
      "c.test": () => new Response(good),
    });
    const r = await swarmDownload(REF, SHA, ["https://a.test", "https://b.test", "https://c.test"]);
    expect(r.gateway).toBe("https://c.test");
    expect(r.failures).toEqual(["https://a.test: fetch failed", "https://b.test: HTTP 404"]);
  });

  it("never accepts bytes with the wrong SHA-256", async () => {
    mockFetch({ "a.test": () => new Response(bad), "b.test": () => new Response(good) });
    const r = await swarmDownload(REF, SHA, ["https://a.test", "https://b.test"]);
    expect(r.gateway).toBe("https://b.test");
    expect(r.failures[0]).toMatch(/SHA-256 mismatch/);
    mockFetch({ "a.test": () => new Response(bad) });
    await expect(swarmDownload(REF, SHA, ["https://a.test"])).rejects.toThrow(/expected SHA-256/);
  });

  it("rejects something that isn't a Swarm reference", async () => {
    await expect(swarmDownload("../etc", SHA)).rejects.toThrow(/Not a Swarm reference/);
  });
});

describe("swarmUpload", () => {
  it("returns the reference and tag", async () => {
    mockFetch({
      "bzz.limo": () =>
        new Response(JSON.stringify({ reference: REF }), {
          status: 201,
          headers: { "swarm-tag": "42" },
        }),
    });
    await expect(swarmUpload("x.json", good)).resolves.toEqual({ reference: REF, tag: "42" });
  });

  it("surfaces gateway errors (e.g. a stamp requirement)", async () => {
    mockFetch({ "bzz.limo": () => new Response("no stamp", { status: 402 }) });
    await expect(swarmUpload("x.json", good)).rejects.toThrow(/HTTP 402 no stamp/);
  });
});
