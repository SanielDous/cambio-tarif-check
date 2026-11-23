import { createRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { ImportSummary } from "@/features/import/import-summary";
import { ImportView } from "@/features/import/import-view";
import { tripsAtom } from "@/state/atoms";
import { rootRoute } from "./__root";

function IndexPage() {
  const { t } = useTranslation("common");
  const hasTrips = useAtomValue(tripsAtom).length > 0;
  return (
    <div className="space-y-8 pb-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("app.title")}</h1>
        <p className="text-muted-foreground">{t("app.subtitle")}</p>
      </header>
      {hasTrips ? (
        <>
          <ImportSummary />
          <div data-testid="result-placeholder" className="text-muted-foreground">
            {t("result.placeholder")}
          </div>
        </>
      ) : (
        <ImportView />
      )}
    </div>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexPage,
});
