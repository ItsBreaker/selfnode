import { chains } from "@selfnode/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Page } from "../../app/AppShell";
import { usePublicClient, useRouteKey, useSelfnode } from "../../state/selfnode";
import { Callout } from "../../ui/Callout";
import { LabeledAddress } from "../../ui/LabeledAddress";
import { Panel } from "../../ui/Panel";
import { Skeleton } from "../../ui/Skeleton";
import { SearchForm } from "./SearchDialog";

export function Explore() {
  const { settings } = useSelfnode();
  const client = usePublicClient();
  const routeKey = useRouteKey();
  const latest = useQuery({
    queryKey: ["latest-blocks", routeKey],
    refetchInterval: 15_000,
    retry: false,
    queryFn: async () => {
      const head = await client.getBlockNumber({ cacheTime: 0 });
      return Promise.all(
        [0n, 1n, 2n, 3n, 4n, 5n].map((i) => client.getBlock({ blockNumber: head - i })),
      );
    },
  });
  return (
    <Page
      title="Explore"
      intro={`Search ${chains[settings.chain].name} through your active connection. Labels and function names come from Selfnode's Arkiv mirror.`}
    >
      <div className="flex flex-col gap-6">
        <SearchForm />
        <Panel title="Latest blocks" flush>
          {latest.isPending ? (
            <div className="flex flex-col gap-3 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : latest.isError ? (
            <div className="p-5">
              <Callout tone="danger" title="Couldn't load blocks through the active route">
                {(latest.error as Error).message.split("\n")[0]}
              </Callout>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-small">
                <thead>
                  <tr className="border-b border-border text-caption uppercase tracking-[0.06em] text-muted">
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Block
                    </th>
                    <th scope="col" className="px-2 py-2.5 font-medium">
                      Age
                    </th>
                    <th scope="col" className="px-2 py-2.5 font-medium">
                      Transactions
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Fee recipient
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {latest.data.map((b) => (
                    <tr key={String(b.number)}>
                      <td className="px-5 py-3 font-mono tabular">
                        <Link
                          to={`/explore/block/${b.number}`}
                          className="underline decoration-border-strong underline-offset-2 hover:decoration-accent"
                        >
                          {b.number.toLocaleString("en-US")}
                        </Link>
                      </td>
                      <td className="px-2 py-3 text-muted">
                        {Math.max(0, Math.round(Date.now() / 1000 - Number(b.timestamp)))} s ago
                      </td>
                      <td className="px-2 py-3 font-mono tabular">{b.transactions.length}</td>
                      <td className="max-w-0 px-5 py-3">
                        <LabeledAddress address={b.miner} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </Page>
  );
}
