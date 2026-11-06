import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router";
import { cx } from "../ui/cx";
import { NAV } from "./nav";

/** Below `lg`: a menu button opening a full-height sheet with 44 px rows. */
export function MobileNav({ themeToggle }: { themeToggle: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="inline-flex size-11 items-center justify-center rounded-md text-text hover:bg-sunken xl:hidden"
        >
          <Menu size={20} aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-text/20" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(20rem,88vw)] flex-col border-l border-border bg-bg p-4">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-small font-semibold">Menu</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="inline-flex size-11 items-center justify-center rounded-md hover:bg-sunken"
              >
                <X size={18} aria-hidden />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Main navigation</Dialog.Description>
          <nav aria-label="Main" className="flex flex-col">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cx(
                    "flex h-11 items-center rounded-md px-3 text-body font-medium",
                    isActive
                      ? "bg-surface text-text shadow-[0_0_0_1px_var(--border)]"
                      : "text-muted hover:text-text",
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
            <span className="text-small text-muted">Theme</span>
            {themeToggle}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
