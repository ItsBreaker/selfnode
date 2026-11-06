/**
 * An address's recent activity, found by scanning the last N blocks through the
 * active route (no indexer). Clearly labelled as a window, never presented as
 * full history.
 */
import { builtinTokens, chains, scanAddress, type TransferRow } from "@selfnode/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import type { Address } from "viem";
import { useLabel } from "../../state/labels";
import { usePublicClient, useRouteKey, useSelfnode } from "../../state/selfnode";
import { activityStore } from "../../storage/db";
import { Amount } from "../../ui/Amount";
import { Badge } from "../../ui/Badge";
import { Callout } from "../../ui/Callout";
import { LabeledAddress } from "../../ui/LabeledAddress";
import { Panel } from "../../ui/Panel";
import { Segmented } from "../../ui/Segmented";
import { Skeleton } from "../../ui/Skeleton";
import { TxTable } from "../../ui/TxTable";

const WINDOWS = ["10", "25", "100"] as const;
type Window = (typeof WINDOWS)[number];
const BLOCK_SECONDS = 12;
const span = (n: number) => {
  const m = Math.round((n * BLOCK_SECONDS) / 60);
  return m < 60 ? `about ${m} min` : `about ${(m / 60).toFixed(m < 600 ? 1 : 0)} h`;
};

export function AddressActivity({ address }: { address: Address }) {
  const { settings } = useSelfnode();
  const client = usePublicClient();
  const routeKey = useRouteKey();
  const [win, setWin] = useState<Window>("10");
  const blocks = Number(win);
  const [scanned, setScanned] = useState(0);
  const scan = useQuery({
    queryKey: ["address-scan", routeKey, address, blocks, settings.chain],
    queryFn: async () => {
      setScanned(0);
      const head = await client.getBlockNumber({ cacheTime: 0 });
      // Public RPCs only answer log queries for named contracts: the tokens Selfnode knows here.
      const tokens = builtinTokens[settings.chain].map((t) => t.address);
      return scanAddress(client, address, head, blocks, setScanned, tokens);
    },
    staleTime: 60_000,
    retry: false,
  });
  const local = useQuery({
    queryKey: ["activity"],
    queryFn: activityStore.list,
    select: (items) =>
      items.filter(
        (i) => i.chain === settings.chain && i.from.toLowerCase() === address.toLowerCase(),
      ),
  });

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title={`Recent activity: last ${blocks} blocks`}
        flush
        actions={
          <Segmented<Window>
            label="Blocks to scan"
            value={win}
            onChange={setWin}
            options={WINDOWS.map((w) => ({ value: w, label: w }))}
          />
        }
      >
        <p className="border-b border-border px-5 py-3 text-caption text-muted">
          {scan.data
            ? `Blocks ${scan.data.fromBlock.toLocaleString("en-US")}–${scan.data.toBlock.toLocaleString("en-US")} on ${chains[settings.chain].name} (${span(blocks)}), scanned through your active connection. `
            : ""}
          Only this window is shown: transactions this address sent or received, and transfers of{" "}
          {builtinTokens[settings.chain].map((t) => t.symbol).join(" and ") || "no tokens"} to or
          from it (public RPCs only answer log queries for named token contracts).
        </p>
        {scan.isPending ? (
          <div className="flex flex-col gap-3 p-5" role="status">
            <p className="text-small text-muted">
              Scanning {scanned ? `${scanned} of ${blocks}` : `${blocks}`} blocks…
            </p>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : scan.isError ? (
          <div className="p-5">
            <Callout tone="danger" title="Couldn't scan the recent blocks">
              {(scan.error as Error).message.split("\n")[0]}. Nothing was sent directly. Try a
              smaller window.
            </Callout>
          </div>
        ) : (
          <div className="flex flex-col">
            <h3 className="px-5 pb-1 pt-4 text-caption font-medium uppercase tracking-[0.06em] text-muted">
              Transactions ({scan.data.txs.length})
            </h3>
            {scan.data.txs.length ? (
              <TxTable rows={scan.data.txs} showBlock />
            ) : (
              <p className="px-5 pb-3 text-small text-muted">None in these blocks.</p>
            )}
            <h3 className="border-t border-border px-5 pb-1 pt-4 text-caption font-medium uppercase tracking-[0.06em] text-muted">
              Token transfers ({scan.data.transfers.length}):{" "}
              {builtinTokens[settings.chain].map((t) => t.symbol).join(", ")}
            </h3>
            {scan.data.transfersError && (
              <p className="px-5 pb-2 text-caption text-warning">
                Couldn&apos;t read token transfers: {scan.data.transfersError}
              </p>
            )}
            {scan.data.transfers.length ? (
              <ul className="divide-y divide-border">
                {scan.data.transfers.map((t) => (
                  <TransferItem key={`${t.hash}:${t.logIndex}`} t={t} self={address} />
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-4 text-small text-muted">None in these blocks.</p>
            )}
          </div>
        )}
      </Panel>

      {!!local.data?.length && (
        <Panel title="Sent from this device" flush>
          <ul className="divide-y divide-border">
            {local.data.map((a) => (
              <li
                key={a.hash}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-small"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Link
                    className="font-mono text-caption underline underline-offset-2"
                    to={`/explore/tx/${a.hash}`}
                  >
                    {a.hash.slice(0, 10)}…
                  </Link>
                  <span className="font-medium">{a.amount}</span>
                  <span className="text-muted">to</span>
                  <LabeledAddress address={a.to} ens />
                </span>
                <Badge
                  tone={
                    a.status === "confirmed"
                      ? "verified"
                      : a.status === "failed"
                        ? "danger"
                        : "warning"
                  }
                >
                  {a.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Callout title="Older history needs an index">
        A standard node can't list an address&apos;s past transactions, so Selfnode only shows what
        it found in the blocks above, plus what you sent from this device. It doesn&apos;t guess or
        fill in the rest. Full history needs an archive node with an index (Erigon or
        Otterscan-style) or an address index such as TrueBlocks&apos; Unchained Index: that&apos;s
        on the roadmap.
      </Callout>
    </div>
  );
}

function TransferItem({ t, self }: { t: TransferRow; self: Address }) {
  const { settings } = useSelfnode();
  const { data: token } = useLabel(chains[settings.chain].id, t.token);
  const incoming = t.to.toLowerCase() === self.toLowerCase();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-small">
      <Badge tone={incoming ? "verified" : "neutral"}>{incoming ? "In" : "Out"}</Badge>
      {token?.decimals !== undefined && token.symbol ? (
        <Amount value={t.amount} decimals={token.decimals} symbol={token.symbol} maxFraction={4} />
      ) : (
        <span className="font-mono text-caption tabular">{t.amount.toString()} units</span>
      )}
      <span className="text-muted">of</span>
      <LabeledAddress address={t.token} />
      <span className="text-muted">{incoming ? "from" : "to"}</span>
      <LabeledAddress address={incoming ? t.from : t.to} ens />
      <Link
        className="ml-auto font-mono text-caption text-muted underline underline-offset-2"
        to={`/explore/tx/${t.hash}`}
      >
        block {t.blockNumber.toLocaleString("en-US")}
      </Link>
    </li>
  );
}
