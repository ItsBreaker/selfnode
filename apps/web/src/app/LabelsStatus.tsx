/** A quiet notice while Arkiv label lookups are failing; it clears on the next success. */
import { useSyncExternalStore } from "react";
import { arkivStatus } from "../state/labels";

export function LabelsStatus() {
  const down = useSyncExternalStore(arkivStatus.subscribe, arkivStatus.get);
  if (!down) return null;
  return (
    <div role="status" className="border-b border-warning/40 bg-warning-soft">
      <p className="mx-auto max-w-6xl px-5 py-2 text-caption text-warning">
        <span className="font-semibold">Labels temporarily unavailable.</span> Arkiv&apos;s public
        endpoint isn&apos;t answering right now (often rate limiting). Showing cached labels where
        there are any; addresses and transactions still work.
      </p>
    </div>
  );
}
