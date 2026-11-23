import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Analysis, TripResult } from "@/domain/analysis/analyze";
import { formatCurrency, formatMonth } from "@/lib/format";
import { monthSectionId } from "./tariffs";
import { TripTable } from "./trip-table";

/** All trips by month, newest month first; each month opens on demand. */
export function TripList({
  analysis,
  openMonths,
  onOpenChange,
}: {
  analysis: Analysis;
  openMonths: string[];
  onOpenChange: (month: string, open: boolean) => void;
}) {
  const { t, i18n } = useTranslation("common");
  const lang = i18n.language;

  const groups = useMemo(() => {
    const byMonth = new Map<string, TripResult[]>();
    for (const r of analysis.trips) byMonth.set(r.month, [...(byMonth.get(r.month) ?? []), r]);
    return analysis.months
      .filter((m) => byMonth.has(m.month))
      .reverse()
      .map((m) => ({
        row: m,
        trips: (byMonth.get(m.month) ?? []).sort((a, b) => a.trip.start - b.trip.start),
      }));
  }, [analysis]);

  return (
    <section aria-labelledby="trips-title" className="space-y-4">
      <div className="space-y-1">
        <h2 id="trips-title" className="text-xl font-semibold tracking-tight">
          {t("result.trips.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("result.trips.intro")}</p>
      </div>
      <div className="divide-y rounded-xl border bg-card text-card-foreground">
        {groups.map(({ row, trips }) => {
          const open = openMonths.includes(row.month);
          const toCheck = trips.filter(
            (r) =>
              r.reconstruction.kind === "estimated" || r.reconstruction.kind === "not-reproducible",
          ).length;
          return (
            <Collapsible
              key={row.month}
              open={open}
              onOpenChange={(next) => onOpenChange(row.month, next)}
              id={monthSectionId(row.month)}
              className="scroll-mt-4"
            >
              <h3>
                <CollapsibleTrigger
                  className="group flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-5"
                  data-month={row.month}
                >
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
                    aria-hidden="true"
                  />
                  <span className="font-medium">{formatMonth(row.month, lang)}</span>
                  <span className="text-sm text-muted-foreground">
                    {t("import.summary.trips", { count: trips.length })}
                  </span>
                  {toCheck > 0 && (
                    <Badge variant="outline" className="border-dashed border-foreground/40">
                      {t("result.trips.toCheck", { count: toCheck })}
                    </Badge>
                  )}
                  <span className="ml-auto text-sm tabular-nums">
                    <span className="text-muted-foreground">{t("result.trips.paid")} </span>
                    <span className="font-medium">{formatCurrency(row.actualCost, lang)}</span>
                  </span>
                </CollapsibleTrigger>
              </h3>
              <CollapsibleContent className="px-3 pb-4 sm:px-4">
                <TripTable trips={trips} tariffs={analysis.tariffs} />
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </section>
  );
}
