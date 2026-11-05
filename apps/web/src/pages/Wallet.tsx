import { useState } from "react";
import { Page } from "../app/AppShell";
import { useWallet } from "../state/wallet";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { Skeleton } from "../ui/Skeleton";
import { CreateWallet } from "./wallet/CreateWallet";
import { ImportWallet } from "./wallet/ImportWallet";
import { Unlock } from "./wallet/Unlock";
import { WalletHome } from "./wallet/WalletHome";

export function Wallet() {
  const { status, lock } = useWallet();
  const [flow, setFlow] = useState<"choose" | "create" | "import">("choose");

  return (
    <Page
      title="Wallet"
      intro="Keys are encrypted with your password and stay on this device. Signing is Sepolia-only in this build."
      actions={status === "unlocked" ? <Button onClick={lock}>Lock</Button> : null}
    >
      {status === "loading" && <Skeleton className="h-40 w-full" />}
      {status === "locked" && (
        <Panel title="Unlock">
          <Unlock />
        </Panel>
      )}
      {status === "unlocked" && <WalletHome />}
      {status === "none" && (
        <Panel
          title={
            flow === "create"
              ? "Create a wallet"
              : flow === "import"
                ? "Import a wallet"
                : "Get started"
          }
        >
          {flow === "choose" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col items-start gap-2 rounded-md border border-border p-5">
                <p className="font-semibold">Create a new wallet</p>
                <p className="text-small text-muted">
                  Generates a 12-word recovery phrase on this device.
                </p>
                <Button variant="primary" className="mt-2" onClick={() => setFlow("create")}>
                  Create
                </Button>
              </div>
              <div className="flex flex-col items-start gap-2 rounded-md border border-border p-5">
                <p className="font-semibold">Import an existing wallet</p>
                <p className="text-small text-muted">From a recovery phrase or a private key.</p>
                <Button className="mt-2" onClick={() => setFlow("import")}>
                  Import
                </Button>
              </div>
            </div>
          )}
          {flow === "create" && <CreateWallet onCancel={() => setFlow("choose")} />}
          {flow === "import" && <ImportWallet onCancel={() => setFlow("choose")} />}
        </Panel>
      )}
    </Page>
  );
}
