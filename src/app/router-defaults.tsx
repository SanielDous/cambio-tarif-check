import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LoadingStatus } from "@/lib/lazy-view";

/** Translated replacements for the router's built-in error, not-found and pending UI. */
export function RouterError({ reset }: { reset: () => void }) {
  const { t } = useTranslation("common");
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-8">
      <h1 className="text-2xl font-semibold">{t("router.error.title")}</h1>
      <p className="text-muted-foreground">{t("router.error.text")}</p>
      <Button variant="outline" onClick={reset}>
        {t("lazy.retry")}
      </Button>
    </div>
  );
}

export function RouterNotFound() {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-3 py-8">
      <h1 className="text-2xl font-semibold">{t("router.notFound.title")}</h1>
      <p>
        <a className="text-primary underline underline-offset-4" href="#/">
          {t("router.notFound.home")}
        </a>
      </p>
    </div>
  );
}

export const RouterPending = LoadingStatus;
