/**
 * Anon-RPC worker code pinning, for the router: the worker hash each network
 * booted with last time (localStorage), and the pending question when it
 * changes. The router waits on `askWorkerCodeChange` before the harness uses
 * the new code; the dialog answers it. Nothing is ever accepted without a click.
 */
import type { WorkerCodeChange, WorkerPinStore } from "@selfnode/core";

const KEY = "selfnode:worker-pins";
const read = (): Record<string, string> => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
};

export const localWorkerPins: WorkerPinStore = {
  get: (id) => {
    const h = read()[id];
    return typeof h === "string" && /^0x[0-9a-f]{64}$/.test(h) ? h : null;
  },
  set: (id, hash) => localStorage.setItem(KEY, JSON.stringify({ ...read(), [id]: hash })),
};

export interface PendingCodeChange {
  change: WorkerCodeChange;
  answer: (accept: boolean) => void;
}
let pending: PendingCodeChange | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const workerCodeChangeStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => pending,
};

/** Called by the router when a network's worker hash differs from the pinned one. */
export function askWorkerCodeChange(change: WorkerCodeChange): Promise<boolean> {
  return new Promise((resolve) => {
    // A second question for the same network replaces (and refuses) the first.
    pending?.answer(false);
    pending = {
      change,
      answer: (accept) => {
        pending = null;
        emit();
        resolve(accept);
      },
    };
    emit();
  });
}
