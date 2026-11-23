import { useTranslation } from "react-i18next";
import type { Analysis } from "@/domain/analysis/analyze";
import { monthlyFee } from "@/domain/analysis/months";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import { formatCurrency, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

/** For each neighbouring tariff pair: from which monthly trip cost the higher fee pays off. */
export function BreakEvenCard({
  analysis,
  additionalDrivers,
}: {
  analysis: Analysis;
  additionalDrivers: number;
}) {
  const { t, i18n } = useTranslation("common");
  const lang = i18n.language;
  const total = analysis.months.length;

  return (
    <section
      aria-labelledby="break-even-title"
      className="flex flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground sm:p-6"
      data-testid="break-even"
    >
      <div className="space-y-1">
        <h2 id="break-even-title" className="text-lg font-semibold tracking-tight">
          {t("result.breakEven.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("result.breakEven.intro")}</p>
      </div>
      {analysis.breakEven.length === 0 ? (
        <p className="text-sm">{t("result.breakEven.none")}</p>
      ) : (
        <ul className="grid gap-5">
          {analysis.breakEven.map(({ lower, higher, monthlyTripCost }) => {
            const names = { lower: t(`tariffs.${lower}`), higher: t(`tariffs.${higher}`) };
            if (monthlyTripCost === null) {
              return (
                <li key={`${lower}-${higher}`} className="text-sm">
                  {t("result.breakEven.never", names)}
                </li>
              );
            }
            const fee = monthlyFee(lower, additionalDrivers, PRICE_DATA);
            const above = analysis.months.map((m) => (m.costs[lower] ?? 0) - fee > monthlyTripCost);
            const count = above.filter(Boolean).length;
            return (
              <li key={`${lower}-${higher}`} className="space-y-2 text-sm">
                <p>
                  {t("result.breakEven.pays", {
                    ...names,
                    amount: formatCurrency(monthlyTripCost, lang),
                  })}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span
                    className="flex gap-0.5"
                    role="img"
                    aria-label={t("result.breakEven.months", { count, total })}
                  >
                    {analysis.months.map((m, i) => (
                      <span
                        key={m.month}
                        title={`${formatMonth(m.month, lang, "short")}: ${t(
                          above[i] ? "result.breakEven.above" : "result.breakEven.below",
                        )}`}
                        className={cn(
                          "h-3 w-2 rounded-[2px] border border-foreground/60",
                          above[i] && "bg-foreground/75",
                        )}
                      />
                    ))}
                  </span>
                  <span className="text-muted-foreground" aria-hidden="true">
                    {t("result.breakEven.months", { count, total })}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
