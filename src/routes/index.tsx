import { useEffect } from "react";
import { createRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { ImportSummary } from "@/features/import/import-summary";
import { ImportView } from "@/features/import/import-view";
import { LazyView, whenIdle, type ViewLoader } from "@/lib/lazy-view";
import { tripsAtom } from "@/state/atoms";
import { rootRoute } from "./__root";

// The result view (matrix, trip list, settings) is only needed once trips are loaded. Its chunk
// is requested as soon as the browser is idle, so it is usually there before a file is read. A
// failed preload is ignored here; showing the result retries and reports the failure.
const loadResultView: ViewLoader = () =>
  import("@/features/result/result-view").then((m) => ({ default: m.ResultView }));

export function IndexPage() {
  const { t } = useTranslation("common");
  const hasTrips = useAtomValue(tripsAtom).length > 0;
  useEffect(() => {
    return whenIdle(() => void loadResultView().catch(() => undefined));
  }, []);
  return (
    <div className="space-y-8 pb-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("app.title")}</h1>
        <p className="text-muted-foreground">{t("app.subtitle")}</p>
      </header>
      {hasTrips ? (
        <>
          <LazyView load={loadResultView} />
          <ImportSummary />
        </>
      ) : (
        <div className="max-w-4xl">
          <ImportView />
        </div>
      )}
    </div>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexPage,
});
