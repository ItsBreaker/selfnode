/**
 * Derive the user-facing connection state. Pure, so the rules are testable:
 * - "starting": the anonymity network is still connecting, nothing has
 *   answered yet, or a read is being retried during the first connection
 *   (`attempt` says which try).
 * - "failed": the worker failed, or the most recent request failed.
 * - "slow": answers are arriving, but slower than `slowMs` on average.
 * - "ready": otherwise.
 * `direct` (requests the user approved to go direct) is reported separately so
 * the indicator can show it alongside any state.
 */
import type { HealthSnapshot } from "./health.js";
import type { Mode, WorkerStatus } from "./types.js";

export type ConnectionState = "starting" | "ready" | "slow" | "failed";

export interface ConnectionInfo {
  state: ConnectionState;
  problem: string | null;
  latencyMs: number | null;
  direct: number;
  /** While a read is retried during the first connection: the attempt now running. */
  attempt: number | null;
}

export const SLOW_MS = 8_000;

export function deriveConnection(input: {
  mode: Mode;
  worker: WorkerStatus;
  health: HealthSnapshot;
  directCount: number;
  slowMs?: number;
  /** The router's retry state (Private mode), if a read is being retried. */
  retry?: { attempt: number } | null;
}): ConnectionInfo {
  const { mode, worker, health, directCount, slowMs = SLOW_MS, retry = null } = input;
  const base = { latencyMs: health.latencyMs, direct: directCount, attempt: null };
  if (health.fatal) return { ...base, state: "failed", problem: health.fatal };
  // Retrying isn't "unavailable": the worker may be restarting between tries.
  if (mode === "private" && retry)
    return { ...base, state: "starting", problem: null, attempt: retry.attempt };
  if (mode === "private" && worker.state === "failed") {
    return { ...base, state: "failed", problem: worker.error };
  }
  const lastErrorIsLatest =
    health.lastErrorAt !== null &&
    (health.lastOkAt === null || health.lastErrorAt > health.lastOkAt);
  if (lastErrorIsLatest) return { ...base, state: "failed", problem: health.lastError };
  if (mode === "private" && worker.state !== "ready")
    return { ...base, state: "starting", problem: null };
  if (health.lastOkAt === null) return { ...base, state: "starting", problem: null };
  if (health.latencyMs !== null && health.latencyMs > slowMs)
    return { ...base, state: "slow", problem: null };
  return { ...base, state: "ready", problem: null };
}
