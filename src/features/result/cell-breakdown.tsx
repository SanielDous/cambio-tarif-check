import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { MonthRow } from "@/domain/analysis/analyze";
import type { TariffId } from "@/domain/pricing/types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function Line({
  label,
  amount,
  indent = false,
  total = false,
}: {
  label: string;
  amount: string;
  indent?: boolean;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4",
        indent && "pl-3 text-muted-foreground",
        total && "mt-1 border-t pt-1 font-semibold",
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{amount}</dd>
    </div>
  );
}

function Frame({
  title,
  children,
  footer,
}: {
  title?: string;
  children: ReactNode;
  footer: string;
}) {
  return (
    <div data-testid="cell-breakdown" className="space-y-1.5">
      {title && <p className="font-medium">{title}</p>}
      <dl className="space-y-0.5">{children}</dl>
      <p className="text-muted-foreground tabular-nums">{footer}</p>
    </div>
  );
}

function useUsage(row: MonthRow) {
  const { t, i18n } = useTranslation("common");
  return t("result.matrix.breakdown.usage", {
    count: row.tripCount,
    km: formatNumber(row.km, i18n.language),
  });
}

/** What the cost of one compared tariff in one month is made of, from the domain's breakdown. */
export function TariffBreakdown({ row, tariff }: { row: MonthRow; tariff: TariffId }) {
  const { t, i18n } = useTranslation("common");
  const usage = useUsage(row);
  const b = row.breakdown[tariff];
  if (!b) return null;
  const money = (cents: number) => formatCurrency(cents, i18n.language);
  const label = (key: string) => t(`result.matrix.breakdown.${key}`);
  return (
    <Frame title={t(`tariffs.${tariff}`)} footer={usage}>
      <Line label={label("tripCosts")} amount={money(b.time + b.km)} />
      <Line indent label={label("time")} amount={money(b.time)} />
      <Line indent label={label("km")} amount={money(b.km)} />
      <Line label={label("fee")} amount={money(b.fee)} />
      {b.driverFee > 0 && <Line label={label("drivers")} amount={money(b.driverFee)} />}
      <Line total label={label("sum")} amount={money(row.costs[tariff] ?? 0)} />
    </Frame>
  );
}

/** What the user paid in one month: the billed trip costs, the fees and a tariff change. */
export function ActualBreakdown({ row }: { row: MonthRow }) {
  const { t, i18n } = useTranslation("common");
  const usage = useUsage(row);
  const b = row.actualBreakdown;
  const money = (cents: number) => formatCurrency(cents, i18n.language);
  const label = (key: string) => t(`result.matrix.breakdown.${key}`);
  return (
    <Frame
      title={t(`result.matrix.breakdown.tariffSource.${row.actualTariffSource}`, {
        tariff: t(`tariffs.${row.actualTariff}`),
      })}
      footer={usage}
    >
      <Line label={label("tripCostsBilled")} amount={money(b.billedTime + b.billedKm)} />
      <Line label={label("fee")} amount={money(b.fee)} />
      {b.driverFee > 0 && <Line label={label("drivers")} amount={money(b.driverFee)} />}
      {row.switched && <Line label={label("switch")} amount={money(b.switchFee)} />}
      <Line total label={label("sum")} amount={money(row.actualCost)} />
    </Frame>
  );
}
