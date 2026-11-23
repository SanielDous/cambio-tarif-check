import { createRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { rootRoute } from "./__root";

function HowItWorksPage() {
  const { t } = useTranslation("common");
  return (
    <section className="space-y-2">
      <h1 className="text-3xl font-semibold">{t("howItWorks.title")}</h1>
      <p>{t("howItWorks.placeholder")}</p>
    </section>
  );
}

export const howItWorksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/how-it-works",
  component: HowItWorksPage,
});
