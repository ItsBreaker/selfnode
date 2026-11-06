import { stringToHex } from "viem";
import { describe, expect, it } from "vitest";
import { arkivConfig } from "../config/arkiv.js";
import { ARCHIVE_FORMAT, loadArchive, type SnapshotPointer } from "./archive.js";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const prov = {
  source: { type: "str", value: "MyEtherWallet/ethereum-lists" },
  license: { type: "str", value: "MIT" },
  sourceCommit: { type: "str", value: "8f86cba9b58db79608ece8fa784775b3c41e2e26" },
};
const files = {
  tokens: [
    { chain: "1", address: A, name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
    { chain: "1", address: B, name: "Scam Token", symbol: "SCAM", decimals: 18 },
  ].map((t) => ({
    rowKey: `token:1:${t.address}`,
    attributes: {
      chain: { type: "str", value: t.chain },
      address: { type: "str", value: t.address },
      name: { type: "str", value: t.name },
      symbol: { type: "str", value: t.symbol },
      decimals: { type: "i32", value: t.decimals },
      ...prov,
    },
  })),
  labels: [
    { address: A, name: "WETH contract", category: "contract" },
    { address: B, name: "Flagged by MyEtherWallet's list", category: "flagged", note: "phishing" },
  ].map((l) => ({
    rowKey: `label:1:${l.address}`,
    attributes: {
      chain: { type: "str", value: "1" },
      address: { type: "str", value: l.address },
      name: { type: "str", value: l.name },
      category: { type: "str", value: l.category },
      ...(l.note ? { note: { type: "bytes", value: stringToHex(l.note) } } : {}),
      ...prov,
    },
  })),
  sigs: [
    {
      rowKey: "sig:0xa9059cbb",
      attributes: {
        selector: { type: "str", value: "0xa9059cbb" },
        text: { type: "bytes", value: stringToHex("transfer(address,uint256)") },
        ...prov,
      },
    },
  ],
};

const encode = (dataset: string, rows: unknown[], owner: string = arkivConfig.mirrorOwner) =>
  new TextEncoder().encode(
    JSON.stringify({ format: ARCHIVE_FORMAT, dataset, owner, rowCount: rows.length, rows }),
  );
const sha = async (b: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const REF = (i: number) => String(i).repeat(64);

async function fixture(over: { owner?: string; tamper?: string } = {}) {
  const served = new Map<string, Uint8Array>();
  const pointers: SnapshotPointer[] = [];
  for (const [i, d] of (["tokens", "labels", "sigs"] as const).entries()) {
    const b = encode(d, files[d], over.owner);
    served.set(REF(i + 1), over.tamper === d ? encode(d, files[d].slice(0, 1)) : b);
    pointers.push({
      dataset: d,
      swarmRef: REF(i + 1),
      sha256: await sha(b),
      rowCount: files[d].length,
    });
  }
  const urls: string[] = [];
  const fetchFn = (async (url: string) => {
    urls.push(url);
    const ref = url.split("/bzz/")[1]?.replace("/", "") ?? "";
    const b = served.get(ref);
    return b ? new Response(b as BodyInit) : new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { pointers, fetchFn, urls };
}

describe("loadArchive", () => {
  it("loads verified snapshots and applies the reader's precedence", async () => {
    const f = await fixture();
    const a = await loadArchive({ fetchFn: f.fetchFn, pointersFromArkiv: async () => f.pointers });
    expect(a.pointers).toBe("arkiv");
    expect(f.urls[0]).toBe(`https://bzz.limo/bzz/${REF(1)}/`);
    expect(a.index.counts).toEqual({ tokens: 2, labels: 2, sigs: 1 });
    // A token keeps its token metadata over a "contract" label…
    expect(a.index.label(1, A.toUpperCase().replace("0X", "0x"))).toMatchObject({
      category: "token",
      symbol: "WETH",
      decimals: 18,
    });
    // …but a flagged label always wins, with its note decoded from bytes.
    expect(a.index.label(1, B)).toMatchObject({ category: "flagged", note: "phishing" });
    expect(a.index.label(11155111, A)).toBeNull();
    expect(a.index.signature("0xA9059CBB")?.texts).toEqual(["transfer(address,uint256)"]);
  });

  it("ignores snapshot entities that aren't datasets (the web app's Swarm mirror)", async () => {
    const f = await fixture();
    const web = { dataset: "web", swarmRef: "f".repeat(64), sha256: "0".repeat(64), rowCount: 88 };
    const a = await loadArchive({
      fetchFn: f.fetchFn,
      pointersFromArkiv: async () => [...f.pointers, web as unknown as SnapshotPointer],
    });
    expect(a.pointers).toBe("arkiv");
    expect(f.urls.some((u) => u.includes("f".repeat(64)))).toBe(false);
  });

  it("rejects a file whose SHA-256 doesn't match its Arkiv record", async () => {
    const f = await fixture({ tamper: "labels" });
    await expect(
      loadArchive({ fetchFn: f.fetchFn, pointersFromArkiv: async () => f.pointers }),
    ).rejects.toThrow(/labels snapshot doesn't match the SHA-256 recorded on Arkiv/);
  });

  it("rejects a snapshot from another owner even if the hash matches", async () => {
    const f = await fixture({ owner: "0x000000000000000000000000000000000000dEaD" });
    await expect(
      loadArchive({ fetchFn: f.fetchFn, pointersFromArkiv: async () => f.pointers }),
    ).rejects.toThrow(/isn't from Selfnode's mirror/);
  });

  it("falls back to the pointers pinned in this build when Arkiv is unreachable", async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(url);
      return new Response("not the real file");
    }) as typeof fetch;
    await expect(
      loadArchive({
        fetchFn,
        pointersFromArkiv: async () => {
          throw new Error("Arkiv down");
        },
      }),
    ).rejects.toThrow(/recorded in this build/);
    expect(urls[0]).toBe(
      "https://bzz.limo/bzz/a287f7361bf3091782ddfc1bea22575ca4d8e4cfe631665f524ab037018ff00d/",
    );
  });

  it("surfaces gateway errors", async () => {
    const f = await fixture();
    const fetchFn = (async () => new Response("", { status: 502 })) as unknown as typeof fetch;
    await expect(
      loadArchive({ fetchFn, pointersFromArkiv: async () => f.pointers }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
