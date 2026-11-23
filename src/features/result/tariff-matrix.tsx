import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleDashed, Hourglass, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { Analysis, MonthRow } from "@/domain/analysis/analyze";
import { monthlyFee } from "@/domain/analysis/months";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import { formatCurrency, formatMonth, formatMonthName } from "@/lib/format";
import { scrollBehavior } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Hint } from "./hint";
import { MatrixLegend } from "./matrix-legend";
import { ActualRows, stickyLeft, stickyRight, TariffRow } from "./matrix-rows";
import { PathOverlay } from "./path-overlay";

export const MATRIX_CAPTION_ID = "cost-matrix-caption";

/** Tracks whether the matrix can scroll further left or right. */
function useScrollEdges() {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);
  const scrollBy = (direction: 1 | -1) =>
    ref.current?.scrollBy({
      left: direction * ref.current.clientWidth * 0.7,
      behavior: scrollBehavior(),
    });
  return { ref, edges, update, scrollBy };
}

/** A small mark next to a month name; its text shows on hover, focus and tap. */
function MonthFlag({
  icon: Icon,
  label,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  testId: string;
}) {
  return (
    <Hint content={label}>
      <button
        type="button"
        aria-label={label}
        data-testid={testId}
        className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </button>
    </Hint>
  );
}

/** The marks of a month that the export may not fully describe. */
function MonthFlags({ row }: { row: MonthRow }) {
  const { t } = useTranslation("common");
  return (
    <>
      {row.incomplete && (
        <MonthFlag
          icon={Hourglass}
          label={t("result.matrix.incomplete")}
          testId="month-incomplete"
        />
      )}
      {row.partial && (
        <MonthFlag icon={CircleDashed} label={t("result.matrix.partial")} testId="month-partial" />
      )}
    </>
  );
}

/**
 * The centrepiece: months as columns, one row per compared tariff plus the user's actual cost
 * and tariff, with a sum column.
 */
export function TariffMatrix({
  analysis,
  additionalDrivers,
  onShowMonth,
}: {
  analysis: Analysis;
  additionalDrivers: number;
  onShowMonth: (month: string) => void;
}) {
  const { t, i18n } = useTranslation("common");
  const lang = i18n.language;
  const { months, tariffs, bestSingle, optimalPath } = analysis;
  const whole = (cents: number) => formatCurrency(cents, lang, { decimals: 0 });
  const exact = (cents: number) => formatCurrency(cents, lang);
  const { ref: scrollRef, edges, update, scrollBy } = useScrollEdges();
  const tableRef = useRef<HTMLDivElement>(null);
  const marks = (cheapest: boolean, actual: boolean, path: boolean) =>
    [
      cheapest && t("result.matrix.marks.cheapest"),
      actual && t("result.matrix.marks.actual"),
      path && t("result.matrix.marks.path"),
    ]
      .filter(Boolean)
      .join(", ") || undefined;

  return (
    <section aria-labelledby="matrix-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="matrix-title" className="text-xl font-semibold tracking-tight">
            {t("result.matrix.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("result.matrix.intro")}</p>
        </div>
        {(edges.left || edges.right) && (
          <div className="flex items-center gap-1">
            <span className="mr-1 hidden text-xs text-muted-foreground sm:inline">
              {t("result.matrix.scrollHint")}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label={t("result.matrix.scrollLeft")}
              disabled={!edges.left}
              onClick={() => scrollBy(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label={t("result.matrix.scrollRight")}
              disabled={!edges.right}
              onClick={() => scrollBy(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>

      <div
        className="group/matrix relative rounded-xl border bg-card text-card-foreground"
        data-scrolled={edges.left}
        data-more={edges.right}
      >
        <div
          ref={scrollRef}
          onScroll={update}
          tabIndex={0}
          role="region"
          aria-labelledby={MATRIX_CAPTION_ID}
          className="overflow-x-auto rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <div ref={tableRef} className="relative w-max min-w-full">
            <table className="w-full border-separate border-spacing-0 text-sm" id="cost-matrix">
              <caption id={MATRIX_CAPTION_ID} className="sr-only">
                {t("result.matrix.caption")}
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className={cn(stickyLeft, "rounded-tl-xl border-b px-4 py-2 font-medium")}
                  >
                    <span className="text-xs text-muted-foreground">
                      {t("result.matrix.tariff")}
                    </span>
                  </th>
                  {months.map((m) => {
                    const long = formatMonth(m.month, lang);
                    const hasTrips = m.tripIds.length > 0;
                    const label = (
                      <span className="flex flex-col items-end leading-tight">
                        <span className="font-medium">{formatMonthName(m.month, lang)}</span>
                        <span className="text-[0.6875rem] text-muted-foreground">
                          {m.month.slice(0, 4)}
                        </span>
                      </span>
                    );
                    return (
                      <th
                        key={m.month}
                        scope="col"
                        className="min-w-[5.75rem] border-b px-1 py-1.5 text-right font-normal"
                        data-testid="month-header"
                        abbr={long}
                      >
                        <div className="flex items-center justify-end">
                          <MonthFlags row={m} />
                          {hasTrips ? (
                            <button
                              type="button"
                              onClick={() => onShowMonth(m.month)}
                              className="ml-auto flex rounded-md px-2 py-1 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                              aria-label={t("result.matrix.showTrips", { month: long })}
                              title={t("result.matrix.showTrips", { month: long })}
                            >
                              {label}
                            </button>
                          ) : (
                            <span
                              className="flex justify-end px-2 py-1"
                              title={t("result.matrix.noTrips", { month: long })}
                            >
                              {label}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th
                    scope="col"
                    className={cn(
                      stickyRight,
                      "rounded-tr-xl border-b px-4 py-2 text-right text-xs font-medium text-muted-foreground",
                    )}
                  >
                    {t("result.matrix.sum")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tariffs.map((tariff, rowIndex) => (
                  <TariffRow
                    key={tariff}
                    tariff={tariff}
                    first={rowIndex === 0}
                    fee={monthlyFee(tariff, additionalDrivers, PRICE_DATA)}
                    analysis={analysis}
                    whole={whole}
                    exact={exact}
                    marks={marks}
                  />
                ))}
                <ActualRows analysis={analysis} />
              </tbody>
            </table>
            <PathOverlay
              containerRef={tableRef}
              version={`${optimalPath.tariffs.join()}|${tariffs.join()}|${lang}|${bestSingle.total}`}
            />
          </div>
        </div>
        {edges.right && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-xl bg-gradient-to-l from-foreground/10 to-transparent sm:hidden"
          />
        )}
      </div>
      <MatrixLegend
        incomplete={months.some((m) => m.incomplete)}
        partial={months.some((m) => m.partial)}
      />
    </section>
  );
}
