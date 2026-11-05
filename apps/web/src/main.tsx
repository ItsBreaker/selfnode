import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/app.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { RouterProvider } from "react-router/dom";
import { NAV } from "./app/Header";
import { NotBuilt } from "./pages/NotBuilt";
import { Styleguide } from "./pages/Styleguide";
import { useTheme } from "./theme";
import { TooltipProvider } from "./ui/Tooltip";

function Root() {
  return (
    <TooltipProvider>
      <Outlet />
    </TooltipProvider>
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
      { path: "/", element: <Navigate to="/styleguide" replace /> },
      { path: "/styleguide", element: <StyleguideRoute /> },
      ...NAV.filter((n) => n.to !== "/").map((n) => ({
        path: n.to,
        element: <NotBuilt title={n.label} />,
      })),
      { path: "*", element: <NotBuilt title="Not found" /> },
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
