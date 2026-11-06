import { isRouteError } from "@selfnode/core";
import { chains } from "@selfnode/core";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { erc20Abi, isHex, parseEventLogs, type Hex } from "viem";
import { Page } from "../../app/AppShell";
import { useLabel } from "../../state/labels";
import { usePublicClient, useRouteKey, useSelfnode } from "../../state/selfnode";
import { Amount } from "../../ui/Amount";
import { Badge } from "../../ui/Badge";
import { QueryError } from "../../ui/QueryError";
import { Callout } from "../../ui/Callout";
import { CopyButton } from "../../ui/CopyButton";
import { LabeledAddress } from "../../ui/LabeledAddress";
import { Panel } from "../../ui/Panel";
import { Skeleton } from "../../ui/Skeleton";
import { DecodedCallView, fmtUnits } from "./Decoded";

export function TxView() {
  const { hash = "" } = useParams();
  const { settings } = useSelfnode();
  const client = usePublicClient();
  const routeKey = useRouteKey();
  const valid = isHex(hash) && hash.length === 66;
  // Progressive: the transaction renders as soon as it arrives; receipt, block time and logs fill in after.
  const txq = useQuery({
    enabled: valid,
    queryKey: ["tx", routeKey, hash],
    retry: false,
    queryFn: () => client.getTransaction({ hash: hash as Hex }),
  });
  const rq = useQuery({
    enabled: valid,
    queryKey: ["receipt", routeKey, hash],
    retry: false,
    queryFn: async () => {
      const receipt = await client.getTransactionReceipt({ hash: hash as Hex }).catch(() => null);
      const block = receipt ? await client.getBlock({ blockNumber: receipt.blockNumber }) : null;
      return { receipt, block };
    },
  });
  const q = {
    isPending: txq.isPending,
    isError: txq.isError,
    error: txq.error,
    data: txq.data
      ? {
          tx: txq.data,
          receipt: rq.data?.receipt ?? null,
          block: rq.data?.block ?? null,
          receiptPending: rq.isPending,
        }
      : undefined,
  };

  if (!valid)
    return (
      <Page title="Transaction">
        <Callout tone="danger" title="That isn't a valid transaction hash" />
      </Page>
    );

  return (
    <Page title="Transaction">
      <div className="flex flex-col gap-5">
        <p className="flex items-center gap-1 break-all font-mono text-small text-muted">
          {hash} <CopyButton value={hash} label="Copy hash" />
        </p>
        {!q.data && !q.isError ? (
          <Skeleton className="h-48 w-full" />
        ) : !q.data && !isRouteError(q.error) ? (
          <QueryError error={q.error} onRetry={() => void txq.refetch()} />
        ) : !q.data ? (
          <Callout
            tone="danger"
            title={`Couldn't find this transaction on ${chains[settings.chain].name}`}
          >
            {(q.error as Error).message.split("\n")[0]}. Check you're on the right network.
          </Callout>
        ) : (
          <>
            <Panel title="Overview">
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-small">
                <dt className="text-muted">Status</dt>
                <dd>
                  {!q.data.receipt ? (
                    <Badge tone="warning">Pending</Badge>
                  ) : q.data.receipt.status === "success" ? (
                    <Badge tone="verified">Success</Badge>
                  ) : (
                    <Badge tone="danger">Failed</Badge>
                  )}
                </dd>
                {q.data.receipt && (
                  <>
                    <dt className="text-muted">Block</dt>
                    <dd className="font-mono tabular">
                      <Link
                        className="underline underline-offset-2"
                        to={`/explore/block/${q.data.receipt.blockNumber}`}
                      >
                        {q.data.receipt.blockNumber.toLocaleString("en-US")}
                      </Link>
                      {q.data.block && (
                        <span className="ml-2 font-sans text-muted">
                          {new Date(Number(q.data.block.timestamp) * 1000).toLocaleString()}
                        </span>
                      )}
                    </dd>
                  </>
                )}
                <dt className="text-muted">From</dt>
                <dd className="min-w-0">
                  <LabeledAddress address={q.data.tx.from} />
                </dd>
                <dt className="text-muted">{q.data.tx.to ? "To" : "Created"}</dt>
                <dd className="min-w-0">
                  {q.data.tx.to ? (
                    <LabeledAddress address={q.data.tx.to} />
                  ) : q.data.receipt?.contractAddress ? (
                    <LabeledAddress address={q.data.receipt.contractAddress} />
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-muted">Value</dt>
                <dd>
                  <Amount value={q.data.tx.value} decimals={18} symbol="ETH" />
                </dd>
                {q.data.receipt && (
                  <>
                    <dt className="text-muted">Fee</dt>
                    <dd>
                      <Amount
                        value={q.data.receipt.gasUsed * q.data.receipt.effectiveGasPrice}
                        decimals={18}
                        symbol="ETH"
                        maxFraction={9}
                      />
                    </dd>
                    <dt className="text-muted">Gas used</dt>
                    <dd className="font-mono tabular">
                      {q.data.receipt.gasUsed.toLocaleString("en-US")} of{" "}
                      {q.data.tx.gas.toLocaleString("en-US")}
                    </dd>
                  </>
                )}
                <dt className="text-muted">Nonce</dt>
                <dd className="font-mono tabular">{q.data.tx.nonce}</dd>
              </dl>
            </Panel>
            <Panel title="Call">
              <DecodedCallView data={q.data.tx.input} />
              {q.data.tx.input !== "0x" && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-small text-muted">
                    Raw calldata ({(q.data.tx.input.length - 2) / 2} bytes)
                  </summary>
                  <p className="mt-2 max-h-40 overflow-auto break-all rounded-sm bg-sunken p-3 font-mono text-caption">
                    {q.data.tx.input}
                  </p>
                </details>
              )}
            </Panel>
            {q.data.receiptPending ? (
              <Panel title="Logs">
                <Skeleton className="h-12 w-full" />
              </Panel>
            ) : (
              q.data.receipt && <Logs logs={q.data.receipt.logs} />
            )}
          </>
        )}
      </div>
    </Page>
  );
}

/** Native ETH transfers can emit a Transfer log from this system address. */
const NATIVE_TRANSFER_EMITTER = "0xfffffffffffffffffffffffffffffffffffffffe";

function TokenAmount({ token, value }: { token: string; value: bigint }) {
  const { settings } = useSelfnode();
  const { data } = useLabel(chains[settings.chain].id, token);
  if (token.toLowerCase() === NATIVE_TRANSFER_EMITTER) {
    return <span className="font-mono tabular">{fmtUnits(value, 18)} ETH</span>;
  }
  if (data?.category === "token" && data.decimals !== undefined) {
    return (
      <span className="font-mono tabular">
        {fmtUnits(value, data.decimals)} {data.symbol}
      </span>
    );
  }
  return (
    <span className="font-mono tabular" title="Token decimals unknown; raw units">
      {value.toString()} units
    </span>
  );
}

function Logs({ logs }: { logs: Parameters<typeof parseEventLogs>[0]["logs"] }) {
  const transfers = parseEventLogs({
    abi: erc20Abi,
    logs,
    eventName: "Transfer",
    strict: false,
  }).filter((l) => l.topics.length === 3);
  return (
    <Panel title={`Logs (${logs.length})`}>
      {!logs.length ? (
        <p className="text-small text-muted">No events were emitted.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {transfers.length > 0 && (
            <div>
              <p className="mb-2 text-caption font-medium uppercase tracking-[0.06em] text-muted">
                Token transfers
              </p>
              <ul className="flex flex-col gap-2 text-small">
                {transfers.map((t, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <TokenAmount
                      token={t.address}
                      value={(t.args.value as bigint | undefined) ?? 0n}
                    />
                    <span className="text-muted">from</span>
                    <LabeledAddress address={t.args.from as string} />
                    <span className="text-muted">to</span>
                    <LabeledAddress address={t.args.to as string} />
                    {t.address.toLowerCase() === NATIVE_TRANSFER_EMITTER ? (
                      <span className="text-caption text-muted">native transfer event</span>
                    ) : (
                      <>
                        <span className="text-muted">via</span>
                        <LabeledAddress address={t.address} />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {logs.length > transfers.length && (
            <p className="text-caption text-muted">
              {logs.length - transfers.length} other event
              {logs.length - transfers.length === 1 ? "" : "s"} not decoded; event names aren't
              mirrored yet.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
