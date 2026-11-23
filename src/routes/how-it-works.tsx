import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./__root";

// The explanation and its price tables load on demand, off the start page's critical path.
export const howItWorksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/how-it-works",
  component: lazyRouteComponent(
    () => import("@/features/info/how-it-works-view"),
    "HowItWorksView",
  ),
});
