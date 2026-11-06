import { chains, type ChainKey } from "@selfnode/core";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { labelUrl, useLabel } from "../state/labels";
import { usePublicClient, useRouteKey, useSelfnode } from "../state/selfnode";
import { Address } from "./Address";
import { Tooltip } from "./Tooltip";

/**
 * An address with its Arkiv label (if any). Flagged addresses are shown as
 * "Flagged by MyEtherWallet's list" with the source, never as a flat "scam".
 */
export function LabeledAddress({
  address,
  chain,
  link = true,
  ens = false,
}: {
  address: string;
  chain?: ChainKey;
  link?: boolean;
  /** Also try the address's ENS name (reverse record) when there's no label. One cached lookup. */
  ens?: boolean;
}) {
  const { settings } = useSelfnode();
  const chainKey = chain ?? settings.chain;
  const { data: label } = useLabel(chains[chainKey].id, address);
  const ensName = useEnsName(ens && !label ? address : null);
  const inner = (
    <Address
      address={address}
      // A flag isn't a name: show the plain address plus the amber badge, never a "verified" tick.
      label={
        label && label.category !== "flagged"
          ? {
              name: label.name,
              source: `${label.source} (${label.license})`,
              fromArkiv: true,
              ...(label.via ? { via: label.via } : {}),
            }
          : ensName.data
            ? { name: ensName.data, source: "ENS reverse record", fromArkiv: false }
            : undefined
      }
    />
  );
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      {link ? (
        <Link to={`/explore/address/${address}`} className="min-w-0 hover:underline">
          {inner}
        </Link>
      ) : (
        inner
      )}
      {label?.category === "flagged" && (
        <Tooltip
          content={
            <span className="flex flex-col gap-1">
              <span>{label.note ?? "Listed as malicious."}</span>
              <span className="text-muted">
                Lists can include mistakes. Check before you interact.
              </span>
            </span>
          }
        >
          <a
            href={labelUrl(label)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-warning-soft px-1.5 py-px text-caption font-semibold text-warning"
          >
            <AlertTriangle size={12} aria-hidden />
            Flagged by MyEtherWallet's list
          </a>
        </Tooltip>
      )}
    </span>
  );
}

/** The address's primary ENS name, through the active route; null if none. Cached for an hour. */
function useEnsName(address: string | null) {
  const client = usePublicClient();
  const routeKey = useRouteKey();
  return useQuery({
    enabled: !!address,
    queryKey: ["ens-name", routeKey, address?.toLowerCase()],
    queryFn: async () =>
      (await client.getEnsName({ address: address as `0x${string}` }).catch(() => null)) ?? null,
    staleTime: 3600_000,
    retry: false,
  });
}
