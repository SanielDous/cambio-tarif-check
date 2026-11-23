import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TariffId } from "@/domain/pricing/types";
import type { TripResult } from "@/domain/analysis/analyze";
import { dayNumber } from "@/domain/pricing/local-time";
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatTime,
  formatWeekdayDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { BookedEndEditor } from "./booked-end-editor";
import { StatusBadge } from "./status-badge";
import { EDITABLE_KINDS } from "./tariffs";

// Below the md breakpoint each row becomes a card.
const cell =
  "align-top md:border-t md:px-3 md:py-2.5 max-md:before:mb-0.5 max-md:before:block max-md:before:text-xs max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]";
const num = "tabular-nums md:text-right whitespace-nowrap";

/** The trips of one month with their cost in every compared tariff. */
export function TripTable({ trips, tariffs }: { trips: TripResult[]; tariffs: TariffId[] }) {
  const { t, i18n } = useTranslation("common");
  const lang = i18n.language;
  const money = (cents: number) => formatCurrency(cents, lang);
  const col = (key: string) => t(`result.trips.columns.${key}`);
  const units = { hour: t("units.hour"), minute: t("units.minute") };

  return (
    <table className="w-full text-sm max-md:block">
      <thead className="max-md:sr-only">
        <tr className="text-xs text-muted-foreground">
          <th scope="col" className="px-3 py-2 text-left font-medium">
            {col("trip")}
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            {col("duration")}
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            {col("km")}
          </th>
          <th scope="col" className="px-3 py-2 text-left font-medium">
            {col("vehicle")}
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            {col("billed")}
          </th>
          {tariffs.map((tariff) => (
            <th key={tariff} scope="col" className="px-3 py-2 text-right font-medium">
              {t(`tariffs.${tariff}`)}
            </th>
          ))}
          <th scope="col" className="px-3 py-2 text-left font-medium">
            {col("status")}
          </th>
        </tr>
      </thead>
      <tbody className="max-md:grid max-md:gap-3">
        {trips.map((result) => {
          const { trip, reconstruction: r } = result;
          const billed = trip.billedTime + trip.billedKm;
          const own = result.costs[trip.tariff];
          const deviation = own ? own.time + own.km - billed : 0;
          const totals = tariffs.map((tariff) => {
            const c = result.costs[tariff];
            return c ? c.time + c.km : null;
          });
          const cheapest = Math.min(...totals.map((x) => x ?? Infinity));
          const bookedLater = r.bookedEnd > r.chargedUntil;
          const sameDay = dayNumber(trip.start) === dayNumber(trip.end);
          return (
            <tr
              key={trip.id}
              data-testid="trip-row"
              className="max-md:grid max-md:grid-cols-4 max-md:gap-x-3 max-md:gap-y-3 max-md:rounded-lg max-md:border max-md:p-3"
            >
              <td
                data-label={col("trip")}
                className={cn(cell, "max-md:col-span-4 max-md:before:hidden")}
              >
                <span className="block font-medium whitespace-nowrap">
                  {formatWeekdayDate(trip.start, lang)}
                </span>
                <span className="block whitespace-nowrap text-muted-foreground tabular-nums">
                  {formatTime(trip.start, lang)} –{" "}
                  {sameDay ? formatTime(trip.end, lang) : formatDateTime(trip.end, lang)}
                </span>
                {bookedLater && (
                  <span className="block text-xs whitespace-nowrap text-muted-foreground">
                    {t("result.trips.bookedUntil", {
                      time:
                        dayNumber(r.bookedEnd) === dayNumber(trip.end)
                          ? formatTime(r.bookedEnd, lang)
                          : formatDateTime(r.bookedEnd, lang),
                    })}
                  </span>
                )}
              </td>
              <td data-label={col("duration")} className={cn(cell, num)}>
                <span className="block">{formatDuration(r.chargedUntil - trip.start, units)}</span>
                {bookedLater && (
                  <span className="block text-xs text-muted-foreground">
                    {t("result.trips.booked", {
                      duration: formatDuration(r.bookedEnd - trip.start, units),
                    })}
                  </span>
                )}
              </td>
              <td data-label={col("km")} className={cn(cell, num)}>
                {formatNumber(trip.km, lang)}
              </td>
              <td data-label={col("vehicle")} className={cn(cell, "max-md:col-span-2")}>
                <span className="block">{trip.vehicleClass}</span>
                <span className="block text-xs text-muted-foreground">
                  {t(`tariffs.${trip.tariff}`)}
                </span>
              </td>
              <td data-label={col("billed")} className={cn(cell, num)}>
                <span className="block font-medium">{money(billed)}</span>
                {deviation !== 0 && (
                  <span
                    className="block text-xs text-muted-foreground"
                    title={t("result.trips.deviationHint")}
                  >
                    {t("result.trips.deviation", {
                      amount: formatCurrency(deviation, lang, { signed: true }),
                    })}
                  </span>
                )}
              </td>
              {tariffs.map((tariff, i) => {
                const total = totals[i] ?? null;
                const best = total !== null && total === cheapest;
                return (
                  <td key={tariff} data-label={t(`tariffs.${tariff}`)} className={cn(cell, num)}>
                    <span className={cn("inline-flex items-center gap-1", best && "font-semibold")}>
                      {best && <Check className="size-3.5 text-best" aria-hidden="true" />}
                      {total === null ? "–" : money(total)}
                      {best && (
                        <span className="sr-only">, {t("result.matrix.marks.cheapest")}</span>
                      )}
                    </span>
                  </td>
                );
              })}
              <td
                data-label={col("status")}
                className={cn(cell, "max-md:col-span-4 max-md:before:hidden")}
              >
                <div className="flex flex-wrap items-center gap-1">
                  <StatusBadge kind={r.kind} />
                  {EDITABLE_KINDS.includes(r.kind) && <BookedEndEditor result={result} />}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
