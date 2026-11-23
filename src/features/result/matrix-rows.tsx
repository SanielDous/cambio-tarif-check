import { ArrowLeftRight, Check, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Analysis } from "@/domain/analysis/analyze";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import type { TariffId } from "@/domain/pricing/types";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActualTariffMenu } from "./actual-tariff-menu";
import { PATH_DOT } from "./path-overlay";
import { tariffColor } from "./tariffs";

export const stickyLeft =
  "sticky left-0 z-20 bg-card text-left max-sm:px-3 shadow-[inset_-1px_0_0_var(--border)] group-data-[scrolled=true]/matrix:shadow-[inset_-1px_0_0_var(--border),6px_0_8px_-6px_rgb(0_0_0/0.18)]";
export const stickyRight =
  "bg-card sm:sticky sm:right-0 sm:z-20 sm:shadow-[inset_1px_0_0_var(--border)] sm:group-data-[more=true]/matrix:shadow-[inset_1px_0_0_var(--border),-6px_0_8px_-6px_rgb(0_0_0/0.18)]";

/** One amount cell with the three marks. */
function Cell({
  amount,
  cheapest,
  actual,
  pathIndex,
  title,
}: {
  amount: string;
  cheapest: boolean;
  actual: boolean;
  /** Month index if the optimal path runs through this cell. */
  pathIndex: number | null;
  title: string | undefined;
}) {
  return (
    <td
      className="relative px-1 pt-1 pb-3.5 text-right"
      title={title}
      data-cheapest={cheapest || undefined}
      data-actual={actual || undefined}
      data-path={pathIndex !== null || undefined}
    >
      <div
        className={cn(
          "flex items-center justify-end gap-1 rounded-md px-2 py-1.5 whitespace-nowrap tabular-nums",
          cheapest && "bg-best-surface font-semibold",
          actual && "ring-2 ring-foreground/75 ring-inset",
        )}
      >
        {cheapest && <Check className="size-3.5 shrink-0 text-best" aria-hidden="true" />}
        {actual && <UserRound className="size-3.5 shrink-0" aria-hidden="true" />}
        <span>{amount}</span>
        {title && <span className="sr-only">, {title}</span>}
      </div>
      {pathIndex !== null && (
        <span
          {...{ [PATH_DOT]: pathIndex }}
          aria-hidden="true"
          className="absolute bottom-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-card"
        />
      )}
    </td>
  );
}

/** One compared tariff: its monthly fee, the cost per month with the marks, and its total. */
export function TariffRow({
  tariff,
  first,
  fee,
  analysis,
  whole,
  exact,
  marks,
}: {
  tariff: TariffId;
  first: boolean;
  fee: number;
  analysis: Analysis;
  whole: (cents: number) => string;
  exact: (cents: number) => string;
  marks: (cheapest: boolean, actual: boolean, path: boolean) => string | undefined;
}) {
  const { t, i18n } = useTranslation("common");
  const best = analysis.bestSingle.tariff === tariff;
  return (
    <tr data-testid="tariff-row" data-tariff={tariff}>
      <th scope="row" className={cn(stickyLeft, "px-4 pt-1 pb-3.5 font-normal", first && "pt-2")}>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-sm"
            style={{ background: tariffColor(tariff) }}
          />
          <span className="font-medium">{t(`tariffs.${tariff}`)}</span>
        </span>
        <span className="block pl-[1.125rem] text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {t("result.matrix.perMonth", {
            amount: formatCurrency(fee, i18n.language, { decimals: fee % 100 === 0 ? 0 : 2 }),
          })}
        </span>
      </th>
      {analysis.months.map((m, i) => {
        const cheapest = m.cheapest === tariff;
        const actual = m.actualTariff === tariff;
        const path = analysis.optimalPath.tariffs[i] === tariff;
        return (
          <Cell
            key={m.month}
            amount={whole(m.costs[tariff] ?? 0)}
            cheapest={cheapest}
            actual={actual}
            pathIndex={path ? i : null}
            title={marks(cheapest, actual, path)}
          />
        );
      })}
      <td
        className={cn(stickyRight, "px-2 pt-1 pb-3.5 text-right", first && "pt-2")}
        title={best ? t("result.matrix.marks.bestTotal") : undefined}
        data-best={best || undefined}
      >
        <div
          className={cn(
            "flex items-center justify-end gap-1 rounded-md px-2 py-1.5 whitespace-nowrap tabular-nums",
            best && "bg-best-surface font-semibold",
          )}
        >
          {best && <Check className="size-3.5 shrink-0 text-best" aria-hidden="true" />}
          <span data-testid={`total-${tariff}`}>{exact(analysis.totals[tariff] ?? 0)}</span>
          {best && <span className="sr-only">, {t("result.matrix.marks.bestTotal")}</span>}
        </div>
      </td>
    </tr>
  );
}

/** What the user actually paid per month, and the tariff they were in (correctable). */
export function ActualRows({ analysis }: { analysis: Analysis }) {
  const { t, i18n } = useTranslation("common");
  const { months } = analysis;
  const whole = (cents: number) => formatCurrency(cents, i18n.language, { decimals: 0 });
  const exact = (cents: number) => formatCurrency(cents, i18n.language);
  return (
    <>
      <tr data-testid="actual-row">
        <th scope="row" className={cn(stickyLeft, "border-t-2 px-4 pt-2 pb-1 font-semibold")}>
          {t("result.matrix.actual")}
        </th>
        {months.map((m) => (
          <td
            key={m.month}
            className="border-t-2 px-3 pt-2 pb-1 text-right font-semibold whitespace-nowrap tabular-nums"
            title={
              m.switched
                ? t("result.matrix.switchFee", {
                    amount: exact(PRICE_DATA.switchingFee),
                  })
                : undefined
            }
          >
            <span className="inline-flex items-center gap-1">
              {m.switched && (
                <>
                  <ArrowLeftRight className="size-3 text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">
                    {t("result.matrix.switchFee", {
                      amount: exact(PRICE_DATA.switchingFee),
                    })}
                    ,{" "}
                  </span>
                </>
              )}
              {whole(m.actualCost)}
            </span>
          </td>
        ))}
        <td
          className={cn(
            stickyRight,
            "border-t-2 px-4 pt-2 pb-1 text-right font-semibold whitespace-nowrap tabular-nums",
          )}
          data-testid="actual-total"
        >
          {exact(analysis.actualTotal)}
        </td>
      </tr>
      <tr>
        <th
          scope="row"
          className={cn(
            stickyLeft,
            "rounded-bl-xl px-4 pt-1 pb-2 text-xs font-normal text-muted-foreground",
          )}
        >
          {t("result.matrix.yourTariff")}
        </th>
        {months.map((m) => (
          <td key={m.month} className="px-1 pt-0.5 pb-2 align-top">
            <ActualTariffMenu row={m} />
          </td>
        ))}
        <td className={cn(stickyRight, "rounded-br-xl")} />
      </tr>
    </>
  );
}
