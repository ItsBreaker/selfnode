/**
 * An error under a panel, worded by what actually went wrong. Only transport
 * failures (a request that failed, timed out or was refused) say "through the
 * active route"; anything else is our own bug and says so, so a display
 * problem is never blamed on the user's connection.
 */
import { isRouteError } from "@selfnode/core";
import { Button } from "./Button";
import { Callout } from "./Callout";

export const firstLine = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).split("\n")[0]?.slice(0, 200) ?? "";

/** One line for inline error text (send, swap): route failure or app error. */
export function describeError(e: unknown): string {
  return isRouteError(e)
    ? `${firstLine(e)}. Nothing was sent directly; Selfnode never falls back.`
    : `Something went wrong in Selfnode (not a connection problem): ${firstLine(e)}`;
}

export function QueryError({
  error,
  what = "this",
  onRetry,
  note,
}: {
  error: unknown;
  /** e.g. "the latest blocks", for "Couldn't load the latest blocks through the active route". */
  what?: string;
  onRetry?: () => void;
  /** Extra advice for route errors (e.g. "Try a smaller window."). */
  note?: string;
}) {
  const route = isRouteError(error);
  const action = onRetry ? (
    <Button size="sm" onClick={onRetry}>
      Try again
    </Button>
  ) : undefined;
  return route ? (
    <Callout tone="danger" title={`Couldn't load ${what} through the active route`} action={action}>
      {firstLine(error)}. Nothing was sent directly.{note ? ` ${note}` : ""}
    </Callout>
  ) : (
    <Callout tone="danger" title="Something went wrong displaying this" action={action}>
      This is a problem in Selfnode itself, not your connection: {firstLine(error)}
    </Callout>
  );
}

/** Above data that's still shown but couldn't refresh. */
export function StaleNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="border-b border-warning/40 bg-warning-soft px-5 py-2 text-caption text-warning">
      {isRouteError(error)
        ? `Couldn't refresh through the active route (${firstLine(error).slice(0, 120)}); showing the last data. Retrying.`
        : `Couldn't refresh this view (${firstLine(error).slice(0, 120)}); showing the last data.`}
    </p>
  );
}
