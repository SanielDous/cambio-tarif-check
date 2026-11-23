import { lazy, Suspense, useEffect } from "react";
import { createRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { ImportSummary } from "@/features/import/import-summary";
import { ImportView } from "@/features/import/import-view";
import { tripsAtom } from "@/state/atoms";
import { rootRoute } from "./__root";

// The result view (matrix, trip list, settings) is only needed once trips are loaded. Its chunk
// is requested as soon as the start page is idle, so it is usually there before a file is read.
const loadResultView = () =>
  import("@/features/result/result-view").then((m) => ({ default: m.ResultView }));
const ResultView = lazy(loadResultView);

function ResultFallback() {
  const { t } = useTranslation("common");
  return (
    <div
      role="status"
      className="rounded-xl border bg-card p-6 text-sm text-muted-foreground motion-safe:animate-pulse"
    >
      {t("result.loading")}
    </div>
  );
}

function IndexPage() {
  const { t } = useTranslation("common");
  const hasTrips = useAtomValue(tripsAtom).length > 0;
  useEffect(() => {
    const id = window.setTimeout(() => void loadResultView(), 300);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="space-y-8 pb-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("app.title")}</h1>
        <p className="text-muted-foreground">{t("app.subtitle")}</p>
      </header>
      {hasTrips ? (
        <>
          <Suspense fallback={<ResultFallback />}>
            <ResultView />
          </Suspense>
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
