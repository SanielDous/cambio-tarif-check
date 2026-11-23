import { createRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { rootRoute } from "./__root";

function IndexPage() {
  const { t } = useTranslation("common");
  return (
    <section className="space-y-2">
      <h1 className="text-3xl font-semibold">{t("app.title")}</h1>
      <p className="text-muted-foreground">{t("app.subtitle")}</p>
      <p>{t("home.placeholder")}</p>
    </section>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexPage,
});
