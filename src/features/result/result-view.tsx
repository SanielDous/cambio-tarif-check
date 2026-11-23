import { lazy, Suspense, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { CalendarX2, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { analysisAtom, settingsAtom } from "@/state/atoms";
import { BreakEvenCard } from "./break-even-card";
import { SettingsBar } from "./settings-bar";
import { SummaryCard } from "./summary-card";
import { MATRIX_CAPTION_ID, TariffMatrix } from "./tariff-matrix";
import { monthSectionId } from "./tariffs";
import { TripList } from "./trip-list";

// Recharts is large; it loads only once a result is shown.
const CostChart = lazy(() => import("./cost-chart"));

function EmptyState() {
  const { t } = useTranslation("common");
  const [settings, setSettings] = useAtom(settingsAtom);
  return (
    <section
      aria-labelledby="empty-title"
      className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card p-6 text-card-foreground"
      data-testid="result-empty"
    >
      <CalendarX2 className="size-6 text-muted-foreground" aria-hidden="true" />
      <h2 id="empty-title" className="text-lg font-semibold">
        {t("result.empty.title")}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t(settings.period ? "result.empty.period" : "result.empty.tariffs")}
      </p>
      {settings.period && (
        <Button variant="outline" onClick={() => setSettings({ ...settings, period: null })}>
          <RotateCcw />
          {t("result.empty.reset")}
        </Button>
      )}
    </section>
  );
}

/** The result page: answer, settings, matrix, chart and break-even, trips. */
export function ResultView() {
  const { t } = useTranslation("common");
  const analysis = useAtomValue(analysisAtom);
  const { additionalDrivers } = useAtomValue(settingsAtom);
  const [openMonths, setOpenMonths] = useState<string[]>([]);

  const setOpen = (month: string, open: boolean) =>
    setOpenMonths((list) =>
      open ? [...new Set([...list, month])] : list.filter((m) => m !== month),
    );

  const showMonth = (month: string) => {
    setOpen(month, true);
    requestAnimationFrame(() => {
      const section = document.getElementById(monthSectionId(month));
      section?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      section?.querySelector<HTMLElement>("button[data-month]")?.focus({ preventScroll: true });
    });
  };

  return (
    <div className="space-y-8" data-testid="result">
      {analysis ? <SummaryCard analysis={analysis} /> : <EmptyState />}
      <SettingsBar />
      {analysis && (
        <>
          <TariffMatrix
            analysis={analysis}
            additionalDrivers={additionalDrivers}
            onShowMonth={showMonth}
          />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section
              aria-labelledby="chart-title"
              className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground sm:p-6"
            >
              <div className="space-y-1">
                <h2 id="chart-title" className="text-lg font-semibold tracking-tight">
                  {t("result.chart.title")}
                </h2>
                <p id="chart-note" className="text-sm text-muted-foreground">
                  {t("result.chart.note")}
                </p>
              </div>
              <Suspense
                fallback={
                  <div className="h-[280px] animate-pulse rounded-md bg-muted/50" aria-busy="true">
                    <span className="sr-only">{t("result.chart.loading")}</span>
                  </div>
                }
              >
                <CostChart analysis={analysis} describedBy={`chart-note ${MATRIX_CAPTION_ID}`} />
              </Suspense>
            </section>
            <BreakEvenCard analysis={analysis} additionalDrivers={additionalDrivers} />
          </div>
          <TripList analysis={analysis} openMonths={openMonths} onOpenChange={setOpen} />
        </>
      )}
    </div>
  );
}
