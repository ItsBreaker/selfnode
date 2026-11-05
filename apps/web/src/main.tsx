import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/app.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Outlet } from "react-router";
import { RouterProvider } from "react-router/dom";
import { AppShell } from "./app/AppShell";
import { NotBuilt } from "./pages/NotBuilt";
import { Overview } from "./pages/Overview";
import { Privacy } from "./pages/Privacy";
import { Settings } from "./pages/Settings";
import { Styleguide } from "./pages/Styleguide";
import { SelfnodeProvider } from "./state/selfnode";
import { useTheme } from "./theme";
import { TooltipProvider } from "./ui/Tooltip";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } },
});

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <SelfnodeProvider>
        <TooltipProvider>
          <Outlet />
        </TooltipProvider>
      </SelfnodeProvider>
    </QueryClientProvider>
  );
}

function StyleguideRoute() {
  const { pref, setPref } = useTheme();
  return <Styleguide pref={pref} setPref={setPref} />;
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/styleguide", element: <StyleguideRoute /> },
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <Overview /> },
          { path: "/settings", element: <Settings /> },
          { path: "/privacy", element: <Privacy /> },
          { path: "/wallet", element: <NotBuilt title="Wallet" /> },
          { path: "/explore", element: <NotBuilt title="Explore" /> },
          { path: "/swap", element: <NotBuilt title="Swap" /> },
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
