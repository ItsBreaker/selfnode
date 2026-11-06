import { describe, expect, it, vi } from "vitest";
import { MirrorReader, type LabelCache } from "./reader.js";

const OWNER = "0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39";
const ADDR = "0x1111111111111111111111111111111111111111";
const label = {
  name: "Cached Contract",
  category: "contract",
  source: "s",
  license: "MIT",
  sourceCommit: "c",
};

function cache(entries: Record<string, { value: unknown; at: number }> = {}): LabelCache {
  const m = new Map(Object.entries(entries));
  return { get: async (k) => m.get(k), put: async (k, value, at) => void m.set(k, { value, at }) };
}
/** The public endpoint rate-limiting every request. */
const rateLimited = vi.fn(
  async () => new Response("Too Many Requests", { status: 429, statusText: "Too Many Requests" }),
) as unknown as typeof fetch;

describe("MirrorReader when Arkiv is unavailable", () => {
  it("serves an expired cached label rather than nothing, and reports the outage", async () => {
    const status: boolean[] = [];
    const r = new MirrorReader({
      owner: OWNER,
      fetchFn: rateLimited,
      ttlMs: 1000,
      cache: cache({ [`addr:1:${ADDR}`]: { value: label, at: Date.now() - 86_400_000 } }),
      onAvailability: (ok) => status.push(ok),
    });
    await expect(r.label(1, ADDR)).resolves.toMatchObject({ name: "Cached Contract" });
    expect(status).toEqual([false]);
  });

  it("fails (for the caller to show 'unavailable') when there's nothing cached", async () => {
    const r = new MirrorReader({ owner: OWNER, fetchFn: rateLimited, cache: cache() });
    await expect(r.label(1, ADDR)).rejects.toThrow();
  });

  it("uses a fresh cache entry without asking Arkiv at all", async () => {
    const f = vi.fn(rateLimited);
    const r = new MirrorReader({
      owner: OWNER,
      fetchFn: f as unknown as typeof fetch,
      cache: cache({ [`addr:1:${ADDR}`]: { value: label, at: Date.now() } }),
    });
    await expect(r.label(1, ADDR)).resolves.toMatchObject({ name: "Cached Contract" });
    expect(f).not.toHaveBeenCalled();
  });
});
