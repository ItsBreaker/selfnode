/**
 * The Arkiv mirror reader for the app. Reads go through Anon-RPC (in every
 * mode) and are cached in IndexedDB, so labels keep working offline.
 */
import {
  arkivConfig,
  type MirrorLabel,
  type MirrorProvenance,
  type MirrorReader,
  type MirrorSig,
} from "@selfnode/core";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { labelCache } from "../storage/db";
import { useSelfnode } from "./selfnode";

/** Same API as MirrorReader, but the Arkiv SDK is only loaded on the first lookup. */
export interface Mirror {
  label(chainId: number, address: string): Promise<MirrorLabel | null>;
  signature(selector: string): Promise<MirrorSig | null>;
}
function lazyMirror(make: () => Promise<MirrorReader>): Mirror {
  let p: Promise<MirrorReader> | null = null;
  const get = () => (p ??= make());
  return {
    label: async (c, a) => (await get()).label(c, a),
    signature: async (s) => (await get()).signature(s),
  };
}

const Ctx = createContext<Mirror | null>(null);

export function LabelsProvider({ children }: { children: ReactNode }) {
  const { router, settings } = useSelfnode();
  const reader = useMemo(
    () =>
      lazyMirror(async () => {
        const { MirrorReader } = await import("@selfnode/core/labels/reader");
        return new MirrorReader({
          owner: arkivConfig.mirrorOwner,
          fetchFn: router.anonFetch(),
          cache: labelCache,
        });
      }),
    // A new anonymity network (or its config) needs a new fetch.
    [router, settings.anonNetwork, JSON.stringify(settings.anonConfig)],
  );
  return <Ctx.Provider value={reader}>{children}</Ctx.Provider>;
}

export function useMirror(): Mirror {
  const r = useContext(Ctx);
  if (!r) throw new Error("useMirror outside LabelsProvider");
  return r;
}

export function useLabel(chainId: number, address: string | null | undefined) {
  const mirror = useMirror();
  return useQuery({
    enabled: !!address,
    queryKey: ["label", chainId, address?.toLowerCase()],
    queryFn: () => mirror.label(chainId, address as string),
    staleTime: 3600_000,
    retry: false,
  });
}

export function useSignature(selector: string | null | undefined) {
  const mirror = useMirror();
  return useQuery({
    enabled: !!selector && /^0x[0-9a-f]{8}$/i.test(selector),
    queryKey: ["sig", selector?.toLowerCase()],
    queryFn: () => mirror.signature(selector as string),
    staleTime: 3600_000,
    retry: false,
  });
}

/** Link to the exact source revision (same as core's sourceUrl, without importing the reader). */
export const labelUrl = (p: MirrorProvenance) =>
  `https://github.com/${p.source}/tree/${p.sourceCommit}`;
