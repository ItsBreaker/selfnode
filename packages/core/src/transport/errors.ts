import type { Mode } from "./types.js";

/**
 * Thrown when the active mode cannot serve a request. Deliberately carries no
 * "retry directly" behaviour: falling back to a direct RPC is only ever an
 * explicit, per-action user choice (see `TransportRouter.directOnce`).
 */
export class TransportUnavailableError extends Error {
  override readonly name = "TransportUnavailableError";
  constructor(
    readonly mode: Mode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** Thrown when code tries to use a non-anonymising worker without opting in. */
export class InsecureWorkerError extends Error {
  override readonly name = "InsecureWorkerError";
}
