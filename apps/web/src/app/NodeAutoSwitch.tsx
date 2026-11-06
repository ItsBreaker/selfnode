/**
 * Desktop only: the first time the local node reports "synced", switch reads
 * to it (My node mode) and say so. Until then Selfnode keeps using
 * Private/Verified. It happens once, so the user can switch back and it sticks.
 */
import { useEffect, useState } from "react";
import { desktop, LOCAL_NODE_RPC } from "../desktop";
import { useSelfnode } from "../state/selfnode";

const FLAG = "selfnode:auto-switched-to-local-node";

export function NodeAutoSwitch() {
  const { settings, setSettings } = useSelfnode();
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!desktop) return;
    return desktop.node.onStatus((s) => {
      if (s.state !== "synced" || localStorage.getItem(FLAG)) return;
      localStorage.setItem(FLAG, String(Date.now()));
      setSettings({
        ...settings,
        mode: "mynode",
        chain: "sepolia",
        myNodeUrl: { ...settings.myNodeUrl, sepolia: LOCAL_NODE_RPC },
      });
      setToast(
        "Your node is synced. Selfnode now reads from it; transactions still go out through the anonymity network.",
      );
    });
  }, [settings, setSettings]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 10_000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-border bg-surface p-4 text-small shadow-pop"
    >
      {toast}
    </div>
  );
}
