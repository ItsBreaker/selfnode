import { describe, expect, it } from "vitest";
import { deriveConnection } from "./connection.js";
import { HealthTracker, type HealthSnapshot } from "./health.js";

const h = (p: Partial<HealthSnapshot> = {}): HealthSnapshot => ({
  lastOkAt: null,
  lastErrorAt: null,
  lastError: null,
  latencyMs: null,
  inflight: 0,
  fatal: null,
  ...p,
});

describe("deriveConnection", () => {
  it("is starting while the anonymity network connects", () => {
    expect(
      deriveConnection({
        mode: "private",
        worker: { state: "starting", since: 0 },
        health: h(),
        directCount: 0,
      }).state,
    ).toBe("starting");
  });
  it("fails when the worker fails, with its reason", () => {
    const c = deriveConnection({
      mode: "private",
      worker: { state: "failed", error: "gateway down" },
      health: h(),
      directCount: 0,
    });
    expect(c).toMatchObject({ state: "failed", problem: "gateway down" });
  });
  it("fails when the latest request failed, recovers after a success", () => {
    const failed = deriveConnection({
      mode: "mynode",
      worker: { state: "idle" },
      health: h({ lastOkAt: 1, lastErrorAt: 2, lastError: "ECONNREFUSED" }),
      directCount: 0,
    });
    expect(failed.state).toBe("failed");
    const ok = deriveConnection({
      mode: "mynode",
      worker: { state: "idle" },
      health: h({ lastOkAt: 3, lastErrorAt: 2, latencyMs: 40 }),
      directCount: 0,
    });
    expect(ok.state).toBe("ready");
  });
  it("stays failed on a fatal problem even after successful requests", () => {
    const c = deriveConnection({
      mode: "mynode",
      worker: { state: "idle" },
      health: h({ lastOkAt: 5, latencyMs: 30, fatal: "wrong chain" }),
      directCount: 0,
    });
    expect(c).toMatchObject({ state: "failed", problem: "wrong chain" });
  });
  it("is slow above the threshold", () => {
    const c = deriveConnection({
      mode: "private",
      worker: { state: "ready", readyMs: 1 },
      health: h({ lastOkAt: 1, latencyMs: 13_000 }),
      directCount: 0,
    });
    expect(c.state).toBe("slow");
  });
  it("reports direct requests alongside any state", () => {
    const c = deriveConnection({
      mode: "private",
      worker: { state: "ready", readyMs: 1 },
      health: h({ lastOkAt: 1, latencyMs: 900 }),
      directCount: 2,
    });
    expect(c).toMatchObject({ state: "ready", direct: 2 });
  });
});

describe("HealthTracker", () => {
  it("records latency and errors", async () => {
    let t = 0;
    const tr = new HealthTracker(() => t);
    await tr.track(async () => {
      t += 100;
    });
    expect(tr.snapshot()).toMatchObject({ latencyMs: 100, inflight: 0, lastOkAt: 100 });
    await expect(
      tr.track(async () => {
        throw new Error("boom\nstack");
      }),
    ).rejects.toThrow();
    expect(tr.snapshot()).toMatchObject({ lastError: "boom", inflight: 0 });
  });
});
