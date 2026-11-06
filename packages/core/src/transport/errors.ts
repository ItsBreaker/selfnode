import { BaseError } from "viem";
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

const ROUTE_ERROR_NAMES = new Set([
  "TransportUnavailableError",
  "InsecureWorkerError",
  "WorkerCodeChangedError",
  "FailoverTimeout",
  "NoTunnelExitError",
  "TunnelOpenTimeoutError",
  "AbortError",
  "TimeoutError",
]);
const ROUTE_ERROR_TEXT =
  /fetch failed|failed to fetch|network|tunnel|timed? ?out|gateway|worker|exit/i;

/**
 * True if `e` came from the transport (a request that failed, timed out or was
 * refused), so "couldn't load this through the active route" is accurate.
 * Everything else (a TypeError in our own code, bad cached data) is a display
 * problem and must not be blamed on the route. viem wraps every transport and
 * RPC failure in its BaseError (`isViemError` is true for those).
 */
export function isRouteError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e instanceof BaseError || typeof (e as { shortMessage?: unknown }).shortMessage === "string")
    return true;
  if (ROUTE_ERROR_NAMES.has(e.name)) return true;
  if (e instanceof TypeError || e instanceof RangeError || e instanceof SyntaxError) return false;
  return ROUTE_ERROR_TEXT.test(e.message);
}
