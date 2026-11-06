/**
 * Public Data page: browse Selfnode's Arkiv mirror without a wallet. Reads go
 * through the same reader as every label lookup (Arkiv through Anon-RPC,
 * owner-scoped), are paginated by entity key, and cached by react-query.
 */
import { planBrowse, type BrowseKind, type BrowseRow, type LabelCategory } from "@selfnode/core";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Page } from "../app/AppShell";
import { labelUrl, useMirror } from "../state/labels";
import { Address } from "../ui/Address";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Callout, EmptyState } from "../ui/Callout";
import { Field } from "../ui/Field";
import { Panel } from "../ui/Panel";
import { Segmented } from "../ui/Segmented";
import { Skeleton } from "../ui/Skeleton";

const KINDS: { value: BrowseKind; label: string; placeholder: string; hint: string }[] = [
  {
    value: "tokens",
    label: "Tokens",
    placeholder: "USDC or 0x…",
    hint: "Search by symbol (prefix) or address.",
  },
  {
    value: "labels",
    label: "Labels",
    placeholder: "Name or 0x…",
    hint: "Search by name or address, and filter by category.",
  },
  {
    value: "sigs",
    label: "Function names",
    placeholder: "transfer or 0xa9059cbb",
    hint: "Search by selector (prefix) or function text.",
  },
];
const PAGE = 25;
const CHAIN: Record<string, string> = { "1": "Ethereum", "11155111": "Sepolia" };

/** Debounce typing so each keystroke isn't a request through the anonymity network. */
function useDebounced<T>(v: T, ms = 350): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function Data() {
  const mirror = useMirror();
  const [kind, setKind] = useState<BrowseKind>("tokens");
  const [text, setText] = useState("");
  const [category, setCategory] = useState<LabelCategory>("all");
  const q = useDebounced(text.trim());
  const query = useMemo(
    () => ({ kind, text: q, ...(kind === "labels" ? { category } : {}) }),
    [kind, q, category],
  );
  const plan = useMemo(() => planBrowse(query), [query]);
  const meta = KINDS.find((k) => k.value === kind) ?? (KINDS[0] as (typeof KINDS)[number]);

  // Arkiv-side search: pages of 25, by entity key.
  const server = useInfiniteQuery({
    enabled: !plan.local,
    queryKey: ["data", "page", query],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => (await mirror.reader()).browsePage(query, pageParam, PAGE),
    getNextPageParam: (last) => last.next,
    staleTime: 10 * 60_000,
  });
  // Device-side search: load the set once (cached), then filter.
  const [loaded, setLoaded] = useState(0);
  const allQuery = { kind, text: "", ...(kind === "labels" ? { category } : {}) };
  const all = useQuery({
    enabled: !!plan.local,
    queryKey: ["data", "all", allQuery],
    queryFn: async () => (await mirror.reader()).browseAll(allQuery, setLoaded),
    staleTime: 30 * 60_000,
  });
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [query]);
  const localHits = plan.local && all.data ? all.data.filter(plan.local) : null;

  const rows: BrowseRow[] = plan.local
    ? (localHits ?? []).slice(0, shown)
    : (server.data?.pages.flatMap((p) => p.rows) ?? []);
  const total = plan.local ? (localHits?.length ?? null) : (server.data?.pages[0]?.total ?? null);
  const loading = plan.local ? all.isLoading : server.isLoading;
  const error = (plan.local ? all.error : server.error) as Error | null;
  const more = plan.local ? localHits !== null && shown < localHits.length : !!server.hasNextPage;

  return (
    <Page
      title="Data"
      intro="Selfnode's Arkiv mirror, open to anyone: tokens, address labels (including MyEtherWallet's scam list) and function names, each with its source, licence and exact source commit. No wallet needed."
    >
      <div className="flex flex-col gap-5">
        <Panel>
          <div className="flex flex-col gap-4">
            <Segmented<BrowseKind>
              label="Dataset"
              value={kind}
              onChange={(k) => {
                setKind(k);
                setText("");
              }}
              options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field
                className="flex-1"
                label="Search"
                mono
                autoComplete="off"
                spellCheck={false}
                placeholder={meta.placeholder}
                value={text}
                onChange={(e) => setText(e.target.value)}
                hint={meta.hint}
              />
              {kind === "labels" && (
                <Segmented<LabelCategory>
                  label="Category"
                  value={category}
                  onChange={setCategory}
                  options={[
                    { value: "all", label: "All" },
                    { value: "contract", label: "Contracts" },
                    { value: "flagged", label: "Flagged" },
                  ]}
                />
              )}
            </div>
            <p className="text-caption text-muted">
              {plan.describe} Reads go through the anonymity network, like every Arkiv lookup in
              Selfnode, and are scoped to the mirror&apos;s owner.
            </p>
          </div>
        </Panel>

        <Panel
          title={
            total === null || total < 0
              ? "Results"
              : `${total.toLocaleString("en-US")} ${total === 1 ? "match" : "matches"}`
          }
          flush
        >
          {error ? (
            <div className="p-5">
              <Callout tone="danger" title="Couldn't read the mirror">
                {error.message.split("\n")[0]}. Nothing was sent directly; try again.
              </Callout>
            </div>
          ) : loading ? (
            <div className="flex flex-col gap-2 p-5" role="status">
              {plan.local && (
                <p className="text-small text-muted">
                  Loading the {kind === "sigs" ? "function names" : "labels"} from Arkiv to search
                  on this device… {loaded ? `${loaded.toLocaleString("en-US")} so far` : ""}
                </p>
              )}
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="No matches">
              Nothing in the mirror matches that. Try a shorter prefix.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <ResultRow key={r.entityKey || r.rowKey} row={r} />
              ))}
            </ul>
          )}
          {more && !error && (
            <div className="border-t border-border p-4">
              <Button
                busy={server.isFetchingNextPage}
                onClick={() =>
                  plan.local ? setShown((n) => n + PAGE) : void server.fetchNextPage()
                }
              >
                Show more
              </Button>
            </div>
          )}
        </Panel>

        <Panel title="Query this yourself">
          <div className="flex flex-col gap-3">
            <p className="text-small text-muted">
              The same query with only the official SDK, no key and no Selfnode code (
              <code className="font-mono">npm i @arkiv-network/sdk viem</code>). Always scope by the
              owner: Arkiv is public, so anyone can write look-alike entities. More in{" "}
              <a
                className="underline underline-offset-2"
                href="https://github.com/ItsBreaker/selfnode/blob/main/arkiv/reach.md"
                target="_blank"
                rel="noreferrer noopener"
              >
                reach.md
              </a>
              .
            </p>
            <pre className="overflow-x-auto rounded-sm bg-sunken p-3 font-mono text-caption">
              {plan.code}
            </pre>
          </div>
        </Panel>
      </div>
    </Page>
  );
}

function Provenance({ r }: { r: BrowseRow }) {
  return (
    <p className="text-caption text-muted">
      <a
        className="underline decoration-border-strong underline-offset-2 hover:text-text"
        href={labelUrl(r)}
        target="_blank"
        rel="noreferrer noopener"
      >
        {r.source}@<span className="font-mono">{r.sourceCommit.slice(0, 7)}</span>
      </a>{" "}
      · {r.license}
    </p>
  );
}

function ResultRow({ row: r }: { row: BrowseRow }) {
  return (
    <li className="flex flex-col gap-1.5 px-5 py-3 text-small sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <span
            className={
              r.kind === "sigs" ? "font-mono font-medium" : "font-medium [overflow-wrap:anywhere]"
            }
          >
            {r.title}
          </span>
          {r.kind === "tokens" && r.subtitle && <span className="text-muted">{r.subtitle}</span>}
          {r.kind === "labels" && r.category === "flagged" && <Badge tone="warning">Flagged</Badge>}
          {r.kind === "labels" && r.category === "contract" && <Badge>Contract</Badge>}
          {r.chain && <Badge>{CHAIN[r.chain] ?? `chain ${r.chain}`}</Badge>}
        </p>
        {r.kind === "sigs" && (
          <p className="font-mono text-caption [overflow-wrap:anywhere]">
            {(r.texts ?? []).join("  ·  ")}
          </p>
        )}
        {r.note && <p className="text-caption text-muted [overflow-wrap:anywhere]">{r.note}</p>}
        <Provenance r={r} />
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:items-end">
        {r.address && (
          <Link to={`/explore/address/${r.address}`} className="hover:underline">
            <Address address={r.address} />
          </Link>
        )}
        {r.kind === "tokens" && r.decimals !== undefined && (
          <span className="text-caption text-muted">{r.decimals} decimals</span>
        )}
        {r.kind === "sigs" && r.rank !== undefined && (
          <span className="text-caption text-muted">usage rank #{r.rank}</span>
        )}
      </div>
    </li>
  );
}
