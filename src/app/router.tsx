import { createHashHistory, createRouter } from "@tanstack/react-router";
import { RouterError, RouterNotFound, RouterPending } from "./router-defaults";
import { rootRoute } from "@/routes/__root";
import { indexRoute } from "@/routes/index";
import { howItWorksRoute } from "@/routes/how-it-works";

const routeTree = rootRoute.addChildren([indexRoute, howItWorksRoute]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: "intent",
  // Scroll restoration would keep scroll positions in sessionStorage; nothing is persisted.
  scrollRestoration: false,
  defaultErrorComponent: RouterError,
  defaultNotFoundComponent: RouterNotFound,
  defaultPendingComponent: RouterPending,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
