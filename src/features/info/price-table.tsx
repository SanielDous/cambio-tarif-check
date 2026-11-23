import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { parseIsoDate } from "@/domain/pricing/price-data";
import { PRICE_CLASSES, TARIFF_IDS, type PriceData, type TariffId } from "@/domain/pricing/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A table in its own horizontally scrollable, keyboard-focusable region. */
function Scroller({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-labelledby={labelledBy}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {children}
    </div>
  );
}

const th = "px-3 py-2 text-left font-medium whitespace-nowrap";
const thNum = "px-3 py-2 text-right font-medium whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap";
const tdNum = "px-3 py-2 text-right whitespace-nowrap tabular-nums";
const table = "w-full border-collapse text-sm";
const headRow = "border-b bg-muted/50 text-muted-foreground";

/**
 * The complete price data as tables: fees per tariff, prices per tariff and class, fuel
 * surcharge periods. Everything is read from `data`; nothing is typed in here.
 */
export function PriceTables({ data }: { data: PriceData }) {
  const { t, i18n } = useTranslation("common");
  const lang = i18n.language;
  const money = (cents: number) => formatCurrency(cents, lang);
  const tariffs = TARIFF_IDS.filter((id) => data.tariffs[id]);
  const name = (id: TariffId) => t(`tariffs.${id}`);

  return (
    <div className="space-y-8" data-testid="price-tables">
      <section aria-labelledby="price-tariffs" className="space-y-3">
        <h3 id="price-tariffs" className="text-base font-semibold">
          {t("howItWorks.prices.tariffs.title")}
        </h3>
        <Scroller labelledBy="price-tariffs">
          <table className={table}>
            <caption className="sr-only">{t("howItWorks.prices.tariffs.title")}</caption>
            <thead>
              <tr className={headRow}>
                <th scope="col" className={th}>
                  {t("howItWorks.prices.tariffs.tariff")}
                </th>
                <th scope="col" className={thNum}>
                  {t("howItWorks.prices.tariffs.monthlyFee")}
                </th>
                <th scope="col" className={thNum}>
                  {t("howItWorks.prices.tariffs.additionalDriver")}
                </th>
                <th scope="col" className={th}>
                  {t("howItWorks.prices.tariffs.availability")}
                </th>
              </tr>
            </thead>
            <tbody>
              {tariffs.map((id) => {
                const tariff = data.tariffs[id];
                return (
                  <tr key={id} className="border-b last:border-b-0" data-tariff={id}>
                    <th scope="row" className={th}>
                      {name(id)}
                    </th>
                    <td className={tdNum}>{money(tariff.monthlyFee)}</td>
                    <td className={tdNum}>
                      {tariff.additionalDriverFee === null
                        ? t("howItWorks.prices.tariffs.notAllowed")
                        : money(tariff.additionalDriverFee)}
                    </td>
                    <td className={td}>
                      {tariff.cities === null
                        ? t("howItWorks.prices.tariffs.everywhere")
                        : tariff.cities.join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Scroller>
        <p className="text-sm text-muted-foreground">
          {t("howItWorks.prices.switching", { fee: money(data.switchingFee) })}
        </p>
      </section>

      <section aria-labelledby="price-classes" className="space-y-3">
        <h3 id="price-classes" className="text-base font-semibold">
          {t("howItWorks.prices.classes.title")}
        </h3>
        <Scroller labelledBy="price-classes">
          <table className={table}>
            <caption className="sr-only">{t("howItWorks.prices.classes.title")}</caption>
            <thead>
              <tr className={headRow}>
                <th scope="col" className={th}>
                  {t("howItWorks.prices.classes.tariff")}
                </th>
                <th scope="col" className={th}>
                  {t("howItWorks.prices.classes.class")}
                </th>
                <th scope="col" className={thNum}>
                  {t("howItWorks.prices.classes.hourWeekday")}
                </th>
                <th scope="col" className={thNum}>
                  {t("howItWorks.prices.classes.hourWeekend")}
                </th>
                <th scope="col" className={thNum}>
                  {t("howItWorks.prices.classes.dayCap")}
                </th>
                <th scope="col" className={thNum}>
                  {t("howItWorks.prices.classes.weekCap")}
                </th>
                <th scope="col" className={thNum}>
                  {t("howItWorks.prices.classes.kmTier1", { boundary: data.kmTierBoundary })}
                </th>
                <th scope="col" className={thNum}>
                  {t("howItWorks.prices.classes.kmTier2", { next: data.kmTierBoundary + 1 })}
                </th>
              </tr>
            </thead>
            {tariffs.map((id) => {
              const classes = PRICE_CLASSES.filter((c) => data.tariffs[id].prices[c]);
              return (
                <tbody key={id} className="border-b last:border-b-0" data-tariff={id}>
                  {classes.map((c, index) => {
                    const price = data.tariffs[id].prices[c];
                    if (!price) return null;
                    const fullDay = data.dayCapHours * price.hourWeekday;
                    return (
                      <tr key={c} className={cn(index > 0 && "border-t border-dashed")}>
                        {index === 0 && (
                          <th
                            scope="rowgroup"
                            rowSpan={classes.length}
                            className={cn(th, "align-top")}
                          >
                            {name(id)}
                          </th>
                        )}
                        <th scope="row" className={th}>
                          {c}
                        </th>
                        <td className={tdNum}>{money(price.hourWeekday)}</td>
                        <td
                          className={cn(
                            tdNum,
                            price.hourWeekend === price.hourWeekday && "text-muted-foreground",
                          )}
                        >
                          {price.hourWeekend === price.hourWeekday
                            ? t("howItWorks.prices.classes.same")
                            : money(price.hourWeekend)}
                        </td>
                        <td className={tdNum}>{money(price.dayCap ?? fullDay)}</td>
                        <td className={tdNum}>{money(data.weekCapDays * fullDay)}</td>
                        <td className={tdNum}>{money(price.kmTier1)}</td>
                        <td className={tdNum}>{money(price.kmTier2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </Scroller>
        <p className="text-sm text-muted-foreground">
          {t("howItWorks.prices.classes.note", {
            dayCapHours: data.dayCapHours,
            weekCapDays: data.weekCapDays,
          })}
        </p>
      </section>

      <section aria-labelledby="price-surcharge" className="space-y-3">
        <h3 id="price-surcharge" className="text-base font-semibold">
          {t("howItWorks.prices.surcharge.title")}
        </h3>
        <Scroller labelledBy="price-surcharge">
          <table className={table}>
            <caption className="sr-only">{t("howItWorks.prices.surcharge.title")}</caption>
            <thead>
              <tr className={headRow}>
                <th scope="col" className={th}>
                  {t("howItWorks.prices.surcharge.from")}
                </th>
                <th scope="col" className={thNum}>
                  {t("howItWorks.prices.surcharge.amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.fuelSurcharges.map((period) => (
                <tr key={period.from} className="border-b last:border-b-0" data-from={period.from}>
                  <th scope="row" className={cn(th, "font-normal")}>
                    {formatDate(parseIsoDate(period.from), lang)}
                  </th>
                  <td className={tdNum}>
                    {t("howItWorks.prices.surcharge.cents", { count: period.cents })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      </section>
    </div>
  );
}
