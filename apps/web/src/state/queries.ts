/**
 * Shared query definitions. Each query key belongs to exactly one shape of
 * data: two pages caching different shapes under one key is how Explore got
 * Overview's `{ number, timestamp, gasPrice }` where it expected a bigint.
 */
import { asBlockNumber } from "@selfnode/core";
import type { PublicClient } from "viem";

export const LIVE_MS = 12_000; // about one block

/** Explore's chain head: always a bigint, whatever ended up in the cache. */
export const exploreHeadQuery = (client: PublicClient, routeKey: string) => ({
  queryKey: ["explore-head", routeKey] as const,
  queryFn: () => client.getBlockNumber({ cacheTime: 0 }),
  // Normalise at the boundary: a cache or JSON round trip can turn a bigint
  // into a number or string.
  select: (v: unknown) => asBlockNumber(v),
  refetchInterval: LIVE_MS,
  retry: false,
});

/** Overview's head: the latest block's number and time, plus the gas price. */
export const OVERVIEW_HEAD_KEY = "overview-head";
