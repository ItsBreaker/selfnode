/** A notice when the anonymity network switches automatically (never to direct). */
import { anonNetworks } from "@selfnode/core";
import { useEffect, useRef, useState } from "react";
import { useFailover } from "../state/selfnode";

export function FailoverNotice() {
  const { events } = useFailover();
  const seen = useRef(events.length);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (events.length > seen.current) {
      const e = events[events.length - 1];
      if (e)
        setText(
          `${anonNetworks[e.from].label} unavailable, switched to ${anonNetworks[e.to].label}. Still anonymised; details in the connection menu.`,
        );
    }
    seen.current = events.length;
  }, [events]);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(null), 12_000);
    return () => clearTimeout(t);
  }, [text]);
  if (!text) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 max-w-sm rounded-md border border-warning/60 bg-surface p-4 text-small shadow-pop"
    >
      {text}
    </div>
  );
}
