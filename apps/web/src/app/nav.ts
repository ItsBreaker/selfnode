export interface NavItem {
  to: string;
  label: string;
  end: boolean;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Overview", end: true },
  { to: "/wallet", label: "Wallet", end: false },
  { to: "/explore", label: "Explore", end: false },
  { to: "/swap", label: "Swap", end: false },
  { to: "/node", label: "Node", end: false },
  { to: "/privacy", label: "Privacy", end: false },
  { to: "/settings", label: "Settings", end: false },
];
