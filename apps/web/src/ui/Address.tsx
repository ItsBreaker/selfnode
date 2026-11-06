import { shortHex } from "@selfnode/core";
import { BadgeCheck } from "lucide-react";
import { CopyButton } from "./CopyButton";
import { Tooltip } from "./Tooltip";
import { cx } from "./cx";

export interface AddressLabel {
  name: string;
  /** Where the label came from, shown on hover. */
  source: string;
  /** True when the label was read from Selfnode's Arkiv mirror (owner-scoped). */
  fromArkiv: boolean;
  /** Set when it came from the Swarm archive (a verified snapshot of the same mirror). */
  via?: "swarm";
}

/**
 * Label (or name) first, short hex second. Never shows a raw 42-character
 * address when a label exists; the full value is always one click away.
 */
export function Address({
  address,
  label,
  className,
}: {
  address: string;
  label?: AddressLabel | undefined;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap",
        className,
      )}
    >
      {label ? (
        <>
          <span className="min-w-[6ch] truncate font-medium text-text">{label.name}</span>
          {label.fromArkiv && (
            <Tooltip
              content={
                label.via === "swarm" ? (
                  <>
                    Verified label from the Swarm archive of Selfnode's Arkiv mirror · source:{" "}
                    {label.source}
                  </>
                ) : (
                  <>Verified label from Arkiv · source: {label.source}</>
                )
              }
            >
              <span
                tabIndex={0}
                className="relative inline-flex text-verified after:absolute after:-inset-3 after:content-['']"
                aria-label={`Verified label from ${label.via === "swarm" ? "the Swarm archive" : "Arkiv"}, source ${label.source}`}
              >
                <BadgeCheck size={14} aria-hidden />
              </span>
            </Tooltip>
          )}
          <span className="shrink-0 font-mono text-small text-muted tabular" title={address}>
            {shortHex(address)}
          </span>
        </>
      ) : (
        <span className="font-mono text-small text-text tabular" title={address}>
          {shortHex(address)}
        </span>
      )}
      <CopyButton value={address} label="Copy address" />
    </span>
  );
}
