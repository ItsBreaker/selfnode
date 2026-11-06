import { chains } from "@selfnode/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import { formatGwei } from "viem";
import { Page } from "../../app/AppShell";
import { usePublicClient, useRouteKey, useSelfnode } from "../../state/selfnode";
import { Callout } from "../../ui/Callout";
import { LabeledAddress } from "../../ui/LabeledAddress";
import { TxTable } from "../../ui/TxTable";
import { Button } from "../../ui/Button";
import { Panel } from "../../ui/Panel";
import { Skeleton } from "../../ui/Skeleton";

const PAGE = 50;

export function BlockView() {
  const [shown, setShown] = useState(PAGE);
  const { number = "" } = useParams();
  const { settings } = useSelfnode();
  const client = usePublicClient();
  const routeKey = useRouteKey();
  const valid = /^\d+$/.test(number);
  const q = useQuery({
    enabled: valid,
    queryKey: ["block", routeKey, number],
    retry: false,
    queryFn: () => client.getBlock({ blockNumber: BigInt(number), includeTransactions: true }),
  });
  if (!valid)
    return (
      <Page title="Block">
        <Callout tone="danger" title="That isn't a block number" />
      </Page>
    );
  return (
    <Page title={`Block ${Number(number).toLocaleString("en-US")}`}>
      {q.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : q.isError ? (
        <Callout tone="danger" title={`Couldn't load this block on ${chains[settings.chain].name}`}>
          {(q.error as Error).message.split("\n")[0]}
        </Callout>
      ) : (
        <div className="flex flex-col gap-5">
          <Panel title="Overview">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-small">
              <dt className="text-muted">Time</dt>
              <dd>{new Date(Number(q.data.timestamp) * 1000).toLocaleString()}</dd>
              <dt className="text-muted">Fee recipient</dt>
              <dd className="min-w-0">
                <LabeledAddress address={q.data.miner} />
              </dd>
              <dt className="text-muted">Transactions</dt>
              <dd className="font-mono tabular">{q.data.transactions.length}</dd>
              <dt className="text-muted">Gas used</dt>
              <dd className="font-mono tabular">
                {q.data.gasUsed.toLocaleString("en-US")} of{" "}
                {q.data.gasLimit.toLocaleString("en-US")}
              </dd>
              {q.data.baseFeePerGas !== null && (
                <>
                  <dt className="text-muted">Base fee</dt>
                  <dd className="font-mono tabular">{formatGwei(q.data.baseFeePerGas)} gwei</dd>
                </>
              )}
              <dt className="text-muted">Hash</dt>
              <dd className="break-all font-mono text-caption">{q.data.hash}</dd>
            </dl>
          </Panel>
          <Panel
            title={`Transactions (${q.data.transactions.length.toLocaleString("en-US")})`}
            flush
          >
            {q.data.transactions.length === 0 ? (
              <p className="p-5 text-small text-muted">No transactions in this block.</p>
            ) : (
              <>
                <TxTable
                  rows={q.data.transactions.slice(0, shown).map((tx) => ({
                    hash: tx.hash,
                    blockNumber: q.data.number as bigint,
                    timestamp: q.data.timestamp,
                    from: tx.from,
                    to: tx.to,
                    value: tx.value,
                    input: tx.input,
                  }))}
                />
                {shown < q.data.transactions.length && (
                  <div className="border-t border-border p-4">
                    <Button onClick={() => setShown((n) => n + PAGE)}>
                      Show more ({(q.data.transactions.length - shown).toLocaleString("en-US")}{" "}
                      left)
                    </Button>
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
      )}
    </Page>
  );
}
