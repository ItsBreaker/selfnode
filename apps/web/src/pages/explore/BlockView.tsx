import { chains } from "@selfnode/core";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { formatGwei } from "viem";
import { Page } from "../../app/AppShell";
import { usePublicClient, useRouteKey, useSelfnode } from "../../state/selfnode";
import { Amount } from "../../ui/Amount";
import { Callout } from "../../ui/Callout";
import { LabeledAddress } from "../../ui/LabeledAddress";
import { Panel } from "../../ui/Panel";
import { Skeleton } from "../../ui/Skeleton";
import { MethodName } from "./Decoded";

const PAGE = 50;

export function BlockView() {
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
            title={`Transactions${q.data.transactions.length > PAGE ? ` (first ${PAGE} of ${q.data.transactions.length})` : ""}`}
            flush
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed text-left text-small">
                <thead>
                  <tr className="border-b border-border text-caption uppercase tracking-[0.06em] text-muted">
                    <th scope="col" className="w-36 px-5 py-2.5 font-medium">
                      Hash
                    </th>
                    <th scope="col" className="w-36 px-2 py-2.5 font-medium">
                      Method
                    </th>
                    <th scope="col" className="px-2 py-2.5 font-medium">
                      From → To
                    </th>
                    <th scope="col" className="w-36 px-5 py-2.5 text-right font-medium">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {q.data.transactions.slice(0, PAGE).map((tx) => (
                    <tr key={tx.hash}>
                      <td className="px-5 py-2.5 font-mono text-caption">
                        <Link
                          className="underline decoration-border-strong underline-offset-2"
                          to={`/explore/tx/${tx.hash}`}
                        >
                          {tx.hash.slice(0, 10)}…
                        </Link>
                      </td>
                      <td className="truncate px-2 py-2.5">
                        <MethodName data={tx.input} />
                      </td>
                      <td className="overflow-hidden px-2 py-2.5">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <LabeledAddress address={tx.from} />
                          <span aria-hidden className="text-muted">
                            →
                          </span>
                          {tx.to ? (
                            <LabeledAddress address={tx.to} />
                          ) : (
                            <span className="text-muted">contract creation</span>
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right">
                        <Amount value={tx.value} decimals={18} symbol="ETH" maxFraction={4} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </Page>
  );
}
