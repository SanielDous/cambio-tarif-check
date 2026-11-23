import { createRoute } from "@tanstack/react-router";
import { LazyView, type ViewLoader } from "@/lib/lazy-view";
import { rootRoute } from "./__root";

// The explanation and its price tables load on demand, off the start page's critical path.
// `React.lazy` (not the router's lazy component) so a failed load never reloads the page or
// touches browser storage.
const loadView: ViewLoader = () =>
  import("@/features/info/how-it-works-view").then((m) => ({ default: m.HowItWorksView }));

function HowItWorksPage() {
  return <LazyView load={loadView} />;
}

export const howItWorksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/how-it-works",
  component: HowItWorksPage,
});
