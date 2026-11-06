import { builtinTokens, chains } from "@selfnode/core";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router";
import { erc20Abi, getAddress, isAddress, type Address } from "viem";
import { Page } from "../../app/AppShell";
import { labelUrl, useLabel } from "../../state/labels";
import { usePublicClient, useRouteKey, useSelfnode } from "../../state/selfnode";
import { Amount } from "../../ui/Amount";
import { Badge } from "../../ui/Badge";
import { AddressActivity } from "./AddressActivity";
import { Callout } from "../../ui/Callout";
import { LabeledAddress } from "../../ui/LabeledAddress";
import { Panel } from "../../ui/Panel";
import { Skeleton } from "../../ui/Skeleton";

export function AddressView() {
  const { address: raw = "" } = useParams();
  const [params] = useSearchParams();
  const { settings } = useSelfnode();
  const chain = chains[settings.chain];
  const client = usePublicClient();
  const routeKey = useRouteKey();
  const valid = isAddress(raw, { strict: false });
  const address = valid ? getAddress(raw) : null;
  const label = useLabel(chain.id, address);

  const state = useQuery({
    enabled: !!address,
    queryKey: ["address", routeKey, address],
    retry: false,
    queryFn: async () => {
      const a = address as Address;
      const tokens = builtinTokens[settings.chain];
      const [balance, nonce, code, tokenBalances] = await Promise.all([
        client.getBalance({ address: a }),
        client.getTransactionCount({ address: a }),
        client.getCode({ address: a }),
        client.multicall({
          allowFailure: true,
          contracts: tokens.map((t) => ({
            address: t.address,
            abi: erc20Abi,
            functionName: "balanceOf" as const,
            args: [a] as const,
          })),
        }),
      ]);
      return {
        balance,
        nonce,
        codeSize: code ? (code.length - 2) / 2 : 0,
        tokens: tokens.map((t, i) => ({ t, r: tokenBalances[i] })),
      };
    },
  });

  if (!address)
    return (
      <Page title="Address">
        <Callout tone="danger" title="That isn't a valid address" />
      </Page>
    );

  return (
    <Page
      title={label.data && label.data.category !== "flagged" ? label.data.name : "Address"}
      intro={params.get("ens") ? `Resolved from ${params.get("ens")}` : undefined}
    >
      <div className="flex flex-col gap-5">
        <Panel>
          <div className="flex flex-col gap-2">
            <LabeledAddress address={address} link={false} />
            <p className="break-all font-mono text-caption text-muted">{address}</p>
            {label.data && (
              <p className="text-caption text-muted">
                Label from Selfnode's Arkiv mirror, source{" "}
                <a
                  className="underline underline-offset-2"
                  href={labelUrl(label.data)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {label.data.source}@{label.data.sourceCommit.slice(0, 7)}
                </a>{" "}
                ({label.data.license})
              </p>
            )}
          </div>
        </Panel>
        {label.data?.category === "flagged" && (
          <Callout tone="warning" title="Flagged by MyEtherWallet's list">
            {label.data.note ? `"${label.data.note}". ` : ""}Lists can include mistakes. Check
            before interacting with this address.
          </Callout>
        )}
        <div className="grid gap-5">
          <Panel title={`State on ${chain.name}`}>
            {state.isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : state.isError ? (
              <Callout tone="danger" title="Couldn't load this address through the active route">
                {(state.error as Error).message.split("\n")[0]}
              </Callout>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-small">
                <dt className="text-muted">Balance</dt>
                <dd>
                  <Amount value={state.data.balance} decimals={18} symbol="ETH" />
                </dd>
                <dt className="text-muted">Type</dt>
                <dd>
                  {state.data.codeSize ? (
                    <Badge>Contract · {state.data.codeSize.toLocaleString("en-US")} bytes</Badge>
                  ) : (
                    <Badge>Account</Badge>
                  )}
                </dd>
                <dt className="text-muted">Transactions sent</dt>
                <dd className="font-mono tabular">{state.data.nonce.toLocaleString("en-US")}</dd>
                {state.data.tokens.map(({ t, r }) => (
                  <div key={t.address} className="contents">
                    <dt className="text-muted">{t.symbol}</dt>
                    <dd>
                      {r && r.status === "success" ? (
                        <Amount
                          value={r.result as bigint}
                          decimals={t.decimals}
                          symbol={t.symbol}
                        />
                      ) : (
                        <span className="text-muted">unavailable</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>
        </div>
        <AddressActivity address={address} />
      </div>
    </Page>
  );
}
