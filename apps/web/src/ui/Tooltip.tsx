import * as RT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = RT.Provider;

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <RT.Root delayDuration={250}>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          sideOffset={6}
          className="z-50 max-w-72 rounded-md border border-border bg-surface px-2.5 py-1.5 text-small text-text shadow-pop"
        >
          {content}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
