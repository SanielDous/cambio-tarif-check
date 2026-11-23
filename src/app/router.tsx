import { createHashHistory, createRouter } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";
import { indexRoute } from "@/routes/index";
import { howItWorksRoute } from "@/routes/how-it-works";

const routeTree = rootRoute.addChildren([indexRoute, howItWorksRoute]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
