/**
 * Explore home, Etherscan-style: latest blocks and latest transactions, live,
 * read through the active route (Anon-RPC in Private mode) and batched.
 */
import { chains, latestBlocks, latestTransactions } from "@selfnode/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { Page } from "../../app/AppShell";
import { usePublicClient, useRouteKey, useSelfnode } from "../../state/selfnode";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Callout";
import { LabeledAddress } from "../../ui/LabeledAddress";
import { Panel } from "../../ui/Panel";
import { Skeleton } from "../../ui/Skeleton";
import { TxTable } from "../../ui/TxTable";
import { age } from "../../ui/age";
import { SearchForm } from "./SearchDialog";

const LIVE_MS = 12_000; // about one block

function Loading() {
  return (
    <div className="flex flex-col gap-3 p-5" role="status">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}

function Failed({ error }: { error: unknown }) {
  return (
    <div className="p-5">
      <Callout tone="danger" title="Couldn't load this through the active route">
        {(error as Error).message.split("\n")[0]}. Nothing was sent directly.
      </Callout>
    </div>
  );
}

export function Explore() {
  const { settings } = useSelfnode();
  const client = usePublicClient();
  const routeKey = useRouteKey();
  const [blockCount, setBlockCount] = useState(8);
  const [txWant, setTxWant] = useState(10);
  // Stay live while the lists are short; stop refreshing a long "load more" list.
  const liveBlocks = blockCount <= 20;
  const liveTxs = txWant <= 25;

  const head = useQuery({
    queryKey: ["head", routeKey],
    queryFn: () => client.getBlockNumber({ cacheTime: 0 }),
    refetchInterval: LIVE_MS,
    retry: false,
  });
  const blocks = useQuery({
    enabled: head.data !== undefined,
    queryKey: [
      "latest-blocks",
      routeKey,
      liveBlocks ? head.data?.toString() : "paused",
      blockCount,
    ],
    queryFn: () => latestBlocks(client, head.data as bigint, blockCount),
    placeholderData: (prev) => prev,
    retry: false,
  });
  const txs = useQuery({
    enabled: head.data !== undefined,
    queryKey: ["latest-txs", routeKey, liveTxs ? head.data?.toString() : "paused", txWant],
    queryFn: () => latestTransactions(client, head.data as bigint, txWant),
    placeholderData: (prev) => prev,
    retry: false,
  });

  return (
    <Page
      title="Explore"
      intro={`${chains[settings.chain].name}, read through your active connection. Labels and function names come from Selfnode's Arkiv mirror.`}
    >
      <div className="flex flex-col gap-6">
        <SearchForm />
        <div className="flex flex-col gap-6">
          <Panel
            title="Latest blocks"
            flush
            actions={<LiveBadge live={liveBlocks} fetching={blocks.isFetching} />}
          >
            {!blocks.data && head.isError ? (
              <Failed error={head.error} />
            ) : !blocks.data ? (
              blocks.isError ? (
                <Failed error={blocks.error} />
              ) : (
                <Loading />
              )
            ) : (
              <>
                <StaleNote error={head.error ?? blocks.error} />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-small">
                    <thead>
                      <tr className="border-b border-border text-caption uppercase tracking-[0.06em] text-muted">
                        <th scope="col" className="px-5 py-2.5 font-medium">
                          Block
                        </th>
                        <th scope="col" className="px-2 py-2.5 font-medium">
                          Age
                        </th>
                        <th scope="col" className="px-2 py-2.5 text-right font-medium">
                          Txns
                        </th>
                        <th scope="col" className="px-2 py-2.5 text-right font-medium">
                          Gas used
                        </th>
                        <th scope="col" className="px-5 py-2.5 font-medium">
                          Fee recipient
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {blocks.data.map((b) => (
                        <tr key={String(b.number)}>
                          <td className="px-5 py-2.5 font-mono tabular">
                            <Link
                              to={`/explore/block/${b.number}`}
                              className="underline decoration-border-strong underline-offset-2 hover:decoration-accent"
                            >
                              {b.number.toLocaleString("en-US")}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2.5 text-caption text-muted">
                            {age(b.timestamp)}
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono tabular">{b.txCount}</td>
                          <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-caption tabular">
                            {b.gasUsed.toLocaleString("en-US")}
                            <span className="text-muted">
                              {" "}
                              ({b.gasLimit ? Number((b.gasUsed * 1000n) / b.gasLimit) / 10 : 0}%)
                            </span>
                          </td>
                          <td className="max-w-0 px-5 py-2.5">
                            <LabeledAddress address={b.miner} ens />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-border p-4">
                  <Button
                    busy={blocks.isFetching && blockCount > blocks.data.length}
                    disabled={blockCount >= 50}
                    onClick={() => setBlockCount((n) => Math.min(50, n + 10))}
                  >
                    Load more blocks
                  </Button>
                </div>
              </>
            )}
          </Panel>

          <Panel
            title="Latest transactions"
            flush
            actions={<LiveBadge live={liveTxs} fetching={txs.isFetching} />}
          >
            {!txs.data && head.isError ? (
              <Failed error={head.error} />
            ) : !txs.data ? (
              txs.isError ? (
                <Failed error={txs.error} />
              ) : (
                <Loading />
              )
            ) : txs.data.txs.length === 0 ? (
              <p className="p-5 text-small text-muted">No transactions in the latest blocks.</p>
            ) : (
              <>
                <StaleNote error={head.error ?? txs.error} />
                <TxTable rows={txs.data.txs.slice(0, txWant)} showBlock />
                <div className="border-t border-border p-4">
                  <Button
                    busy={txs.isFetching && txWant > txs.data.txs.length}
                    disabled={txWant >= 100}
                    onClick={() => setTxWant((n) => Math.min(100, n + 15))}
                  >
                    Load more transactions
                  </Button>
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>
    </Page>
  );
}

/** Shown above a table that still has data but couldn't refresh. */
function StaleNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="border-b border-warning/40 bg-warning-soft px-5 py-2 text-caption text-warning">
      Couldn&apos;t refresh ({(error as Error).message.split("\n")[0]?.slice(0, 120)}); showing the
      last data. Retrying.
    </p>
  );
}

function LiveBadge({ live, fetching }: { live: boolean; fetching: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-caption text-muted" aria-live="polite">
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${live ? (fetching ? "bg-warning" : "bg-private") : "bg-border-strong"}`}
      />
      {live ? (fetching ? "Updating…" : "Live") : "Paused (showing more)"}
    </span>
  );
}
