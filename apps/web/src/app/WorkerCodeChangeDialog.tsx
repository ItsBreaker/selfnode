import * as Dialog from "@radix-ui/react-dialog";
import { anonNetworks } from "@selfnode/core";
import { useSyncExternalStore } from "react";
import { workerCodeChangeStore } from "../state/workerPins";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";

/**
 * Asks before Selfnode runs an anonymity network's changed code. Closing the
 * dialog any way other than "Use the new code" refuses it.
 */
export function WorkerCodeChangeDialog() {
  const p = useSyncExternalStore(workerCodeChangeStore.subscribe, workerCodeChangeStore.get);
  if (!p) return null;
  const { change } = p;
  const net = anonNetworks[change.network];
  return (
    <Dialog.Root open onOpenChange={(open) => !open && p.answer(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-text/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex w-[min(34rem,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-md border border-border bg-surface p-5">
          <Dialog.Title className="text-lead font-semibold">
            The anonymity network&apos;s code changed since you last used it
          </Dialog.Title>
          <Dialog.Description asChild>
            <div className="flex flex-col gap-3 text-small">
              <p>
                Selfnode only runs {change.label}&apos;s code if it matches the hash published in
                its on-chain specifier. That hash is different from the one {change.label} used on
                this device before.
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-sunken p-3 font-mono text-caption">
                <dt className="text-muted">Before</dt>
                <dd className="break-all">{change.previous}</dd>
                <dt className="text-muted">Now</dt>
                <dd className="break-all">{change.current}</dd>
                <dt className="text-muted">Specifier</dt>
                <dd className="break-all">
                  {net.specifier} ({net.specifierChain})
                </dd>
              </dl>
              <Callout tone="warning" title="Only accept if you expect an update">
                This is normal after the network&apos;s maintainers publish a new version, but it
                could also mean the specifier was changed by someone else. If you cancel, Selfnode
                won&apos;t connect through {change.label}, and it never falls back to a direct
                connection. You&apos;ll be asked again next time.
              </Callout>
            </div>
          </Dialog.Description>
          <div className="flex flex-wrap justify-end gap-3">
            <Dialog.Close asChild>
              <Button autoFocus>Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" onClick={() => p.answer(true)}>
              Use the new code
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
