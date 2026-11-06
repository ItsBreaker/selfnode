/**
 * The Arkiv mirror reader for the app. Reads go through Anon-RPC (in every
 * mode) and are cached in IndexedDB, so labels keep working offline.
 *
 * Optional, opt-in only: "Load labels from the Swarm archive" (Settings)
 * downloads Selfnode's dataset snapshots directly from the bzz.limo gateway,
 * verified against the SHA-256 recorded on Arkiv. Never automatic and never
 * persisted: it only happens when the user clicks, for this session.
 */
import {
  arkivConfig,
  type MirrorLabel,
  type MirrorProvenance,
  type MirrorReader,
  type MirrorSig,
} from "@selfnode/core";
import type { LoadedArchive } from "@selfnode/core/labels/archive";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { labelCache } from "../storage/db";
import { useSelfnode } from "./selfnode";

/** Same API as MirrorReader, but the Arkiv SDK is only loaded on the first lookup. */
export interface Mirror {
  label(chainId: number, address: string): Promise<MirrorLabel | null>;
  signature(selector: string): Promise<MirrorSig | null>;
  /** The underlying reader (Arkiv through Anon-RPC), e.g. for browsing on the Data page. */
  reader(): Promise<MirrorReader>;
}
function lazyMirror(
  make: () => Promise<MirrorReader>,
): Mirror & { reader(): Promise<MirrorReader> } {
  let p: Promise<MirrorReader> | null = null;
  const get = () => (p ??= make());
  return {
    reader: get,
    label: async (c, a) => (await get()).label(c, a),
    signature: async (s) => (await get()).signature(s),
  };
}

export type ArchiveState =
  | { status: "off" }
  | { status: "loading"; done: number; total: number }
  | { status: "ready"; loaded: LoadedArchive; at: number }
  | { status: "error"; message: string };
interface ArchiveCtx {
  state: ArchiveState;
  /** Download and verify the snapshots. Only ever called from an explicit user action. */
  load: () => Promise<void>;
  unload: () => void;
}

const Ctx = createContext<Mirror | null>(null);
const ArchiveContext = createContext<ArchiveCtx | null>(null);

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
  const qc = useQueryClient();
  const [archive, setArchive] = useState<ArchiveState>({ status: "off" });
  const indexRef = useRef<LoadedArchive["index"] | null>(null);

  // The archive (if loaded) answers first; anything it doesn't have goes to Arkiv as usual.
  const mirror = useMemo<Mirror>(
    () => ({
      reader: reader.reader,
      label: async (c, a) => {
        const hit = indexRef.current?.label(c, a);
        return hit ? { ...hit, via: "swarm" } : reader.label(c, a);
      },
      signature: async (sel) => {
        const hit = indexRef.current?.signature(sel);
        return hit ? { ...hit, via: "swarm" } : reader.signature(sel);
      },
    }),
    [reader],
  );

  const load = useCallback(async () => {
    setArchive({ status: "loading", done: 0, total: 3 });
    try {
      const { loadArchive } = await import("@selfnode/core/labels/archive");
      const loaded = await loadArchive({
        // A direct download: the user has just agreed that the gateway sees their IP.
        fetchFn: (...a) => fetch(...a),
        // Which files and hashes to expect: from Arkiv, through Anon-RPC.
        pointersFromArkiv: async () => (await reader.reader()).snapshots(),
        onProgress: (done, total) => setArchive({ status: "loading", done, total }),
      });
      indexRef.current = loaded.index;
      setArchive({ status: "ready", loaded, at: Date.now() });
      void qc.invalidateQueries({ queryKey: ["label"] });
      void qc.invalidateQueries({ queryKey: ["sig"] });
    } catch (e) {
      indexRef.current = null;
      setArchive({ status: "error", message: (e as Error).message.split("\n")[0] ?? "failed" });
    }
  }, [reader, qc]);

  const unload = useCallback(() => {
    indexRef.current = null;
    setArchive({ status: "off" });
    void qc.invalidateQueries({ queryKey: ["label"] });
    void qc.invalidateQueries({ queryKey: ["sig"] });
  }, [qc]);

  const archiveCtx = useMemo(() => ({ state: archive, load, unload }), [archive, load, unload]);
  return (
    <ArchiveContext.Provider value={archiveCtx}>
      <Ctx.Provider value={mirror}>{children}</Ctx.Provider>
    </ArchiveContext.Provider>
  );
}

export function useSwarmArchive(): ArchiveCtx {
  const c = useContext(ArchiveContext);
  if (!c) throw new Error("useSwarmArchive outside LabelsProvider");
  return c;
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
