import { chains } from "@selfnode/core";
import { useBalances } from "../../state/balances";
import { useSelfnode } from "../../state/selfnode";
import { useWallet } from "../../state/wallet";
import { Amount } from "../../ui/Amount";
import { Callout } from "../../ui/Callout";
import { Panel } from "../../ui/Panel";
import { Skeleton } from "../../ui/Skeleton";

export function BalancesPanel() {
  const { settings } = useSelfnode();
  const { address } = useWallet();
  const b = useBalances(address, settings.chain);
  return (
    <Panel title={`Balances on ${chains[settings.chain].name}`}>
      {b.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
        </div>
      ) : b.isError ? (
        <Callout tone="danger" title="Couldn't load balances through the active route">
          {(b.error as Error).message.split("\n")[0]}
        </Callout>
      ) : (
        <div className="flex flex-col gap-4">
          <Amount value={b.data.native} decimals={18} symbol="ETH" size="h1" />
          <ul className="flex flex-col divide-y divide-border border-t border-border">
            {b.data.tokens.map(({ token, balance }) => (
              <li key={token.address} className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-small text-muted">{token.name}</span>
                {balance === null ? (
                  <span className="text-small text-muted">unavailable</span>
                ) : (
                  <Amount value={balance} decimals={token.decimals} symbol={token.symbol} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
