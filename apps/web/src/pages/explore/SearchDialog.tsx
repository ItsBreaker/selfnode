import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { usePublicClient } from "../../state/selfnode";
import { Kbd } from "../../ui/Kbd";
import { classify, resolveEns } from "./search";

/** Navigate to the right explorer view for a query; resolves ENS through the active route. */
export function useExplorerSearch() {
  const navigate = useNavigate();
  const client = usePublicClient();
  return async (q: string): Promise<string | null> => {
    const t = classify(q);
    if (t.kind === "invalid") return t.reason;
    if (t.kind === "address") navigate(`/explore/address/${t.value}`);
    if (t.kind === "tx") navigate(`/explore/tx/${t.value}`);
    if (t.kind === "block") navigate(`/explore/block/${t.value}`);
    if (t.kind === "ens") {
      try {
        const a = await resolveEns(client, t.value);
        if (!a) return `${t.value} doesn't resolve to an address on this network`;
        navigate(`/explore/address/${a}?ens=${encodeURIComponent(t.value)}`);
      } catch (e) {
        return `Couldn't resolve ${t.value}: ${(e as Error).message.split("\n")[0]}`;
      }
    }
    return null;
  };
}

export function SearchForm({ onDone, autoFocus }: { onDone?: () => void; autoFocus?: boolean }) {
  const search = useExplorerSearch();
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await search(q);
    setBusy(false);
    setError(err);
    if (!err) {
      setQ("");
      onDone?.();
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} role="search" className="flex flex-col gap-2">
      <label htmlFor="explorer-search" className="sr-only">
        Search
      </label>
      <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface px-3 focus-within:outline-2 focus-within:outline-focus">
        <Search size={16} aria-hidden className="text-muted" />
        <input
          id="explorer-search"
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Address, transaction hash, block number or ENS name"
          autoComplete="off"
          spellCheck={false}
          className="h-11 w-full bg-transparent font-mono text-small outline-none placeholder:font-sans placeholder:text-muted"
        />
        {busy && <span className="text-caption text-muted">Resolving…</span>}
      </div>
      {error && <p className="text-small text-danger">{error}</p>}
    </form>
  );
}

/** Global ⌘K / Ctrl+K search. */
export function SearchDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-text/20" />
        <Dialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[min(40rem,calc(100vw-24px))] -translate-x-1/2 rounded-md border border-border bg-bg p-4 shadow-pop">
          <Dialog.Title className="mb-3 text-small font-semibold">Search the chain</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search by address, transaction hash, block number or ENS name
          </Dialog.Description>
          <SearchForm autoFocus onDone={() => setOpen(false)} />
          <p className="mt-3 text-caption text-muted">
            Lookups go through your active connection. <Kbd>Esc</Kbd> to close.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
