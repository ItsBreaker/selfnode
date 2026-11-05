import { builtinTokens, type ChainKey, type TokenInfo } from "@selfnode/core";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, type Address } from "viem";
import { usePublicClient, useRouteKey } from "./selfnode";

export interface Balances {
  native: bigint;
  tokens: { token: TokenInfo; balance: bigint | null }[];
}

/** ETH + built-in token balances in one multicall through the active route. */
export function useBalances(address: Address | null, chain: ChainKey) {
  const client = usePublicClient(chain);
  const routeKey = useRouteKey();
  return useQuery({
    enabled: !!address,
    queryKey: ["balances", routeKey, chain, address],
    refetchInterval: 30_000,
    retry: false,
    queryFn: async (): Promise<Balances> => {
      const tokens = builtinTokens[chain];
      const [native, results] = await Promise.all([
        client.getBalance({ address: address as Address }),
        client.multicall({
          allowFailure: true,
          contracts: tokens.map((t) => ({
            address: t.address,
            abi: erc20Abi,
            functionName: "balanceOf" as const,
            args: [address as Address] as const,
          })),
        }),
      ]);
      return {
        native,
        tokens: tokens.map((token, i) => {
          const r = results[i];
          return { token, balance: r && r.status === "success" ? (r.result as bigint) : null };
        }),
      };
    },
  });
}
