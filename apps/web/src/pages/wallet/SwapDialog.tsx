/**
 * The Wallet page's Swap button: the existing swap flow (same code, same
 * checks, same unlocked wallet) in a dialog. The Swap tab is unchanged.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";

const Swap = lazy(() => import("../Swap").then((m) => ({ default: m.Swap })));

export function SwapButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button size="sm">Swap</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-text/30" />
        <Dialog.Content className="fixed inset-x-2 bottom-2 top-2 z-50 overflow-y-auto rounded-md border border-border bg-bg sm:inset-x-6 sm:bottom-6 sm:top-6 xl:left-1/2 xl:right-auto xl:w-[72rem] xl:-translate-x-1/2">
          <Dialog.Title className="sr-only">Swap from this wallet</Dialog.Title>
          <Dialog.Description className="sr-only">
            Uniswap v4 on Sepolia with the wallet that's unlocked now.
          </Dialog.Description>
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close swap"
              className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-text"
            >
              <X size={18} aria-hidden />
            </button>
          </Dialog.Close>
          <Suspense
            fallback={
              <div className="flex flex-col gap-3 p-8">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <Swap />
          </Suspense>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
