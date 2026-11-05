import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/app.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Outlet } from "react-router";
import { RouterProvider } from "react-router/dom";
import { AppShell } from "./app/AppShell";
import { NotBuilt } from "./pages/NotBuilt";
const TxView = lazy(() => import("./pages/explore/TxView").then((m) => ({ default: m.TxView })));
const Explore = lazy(() => import("./pages/explore/Explore").then((m) => ({ default: m.Explore })));
const BlockView = lazy(() =>
  import("./pages/explore/BlockView").then((m) => ({ default: m.BlockView })),
);
const AddressView = lazy(() =>
  import("./pages/explore/AddressView").then((m) => ({ default: m.AddressView })),
);
const Swap = lazy(() => import("./pages/Swap").then((m) => ({ default: m.Swap })));
const Wallet = lazy(() => import("./pages/Wallet").then((m) => ({ default: m.Wallet })));
const Styleguide = lazy(() =>
  import("./pages/Styleguide").then((m) => ({ default: m.Styleguide })),
);
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const Privacy = lazy(() => import("./pages/Privacy").then((m) => ({ default: m.Privacy })));
import { Overview } from "./pages/Overview";
import { LabelsProvider } from "./state/labels";
import { SelfnodeProvider } from "./state/selfnode";
import { WalletProvider } from "./state/wallet";
import { useTheme } from "./theme";
import { TooltipProvider } from "./ui/Tooltip";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } },
});

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <SelfnodeProvider>
        <LabelsProvider>
          <WalletProvider>
            <TooltipProvider>
              <Outlet />
            </TooltipProvider>
          </WalletProvider>
        </LabelsProvider>
      </SelfnodeProvider>
    </QueryClientProvider>
  );
}

/** Route-level code splitting: pages load on demand, with a layout-shaped placeholder. */
function PageFallback() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-10" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-48 rounded-sm bg-sunken" />
      <div className="mt-8 h-64 rounded-md border border-border bg-surface" />
    </div>
  );
}
const page = (el: React.ReactNode) => <Suspense fallback={<PageFallback />}>{el}</Suspense>;

function StyleguideRoute() {
  const { pref, setPref } = useTheme();
  return <Styleguide pref={pref} setPref={setPref} />;
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/styleguide", element: page(<StyleguideRoute />) },
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <Overview /> },
          { path: "/settings", element: page(<Settings />) },
          { path: "/privacy", element: page(<Privacy />) },
          { path: "/wallet", element: page(<Wallet />) },
          { path: "/explore", element: page(<Explore />) },
          { path: "/explore/address/:address", element: page(<AddressView />) },
          { path: "/explore/tx/:hash", element: page(<TxView />) },
          { path: "/explore/block/:number", element: page(<BlockView />) },
          { path: "/swap", element: page(<Swap />) },
          { path: "/node", element: <NotBuilt title="Node" /> },
          { path: "*", element: <NotBuilt title="Not found" /> },
        ],
      },
    ],
  },
]);

const el = document.getElementById("root");
if (!el) throw new Error("#root missing");
createRoot(el).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
