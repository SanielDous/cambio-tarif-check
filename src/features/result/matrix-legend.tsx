import { ArrowLeftRight, Check, CircleDashed, Hourglass, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { latestPrices, PRICE_DATA } from "@/domain/pricing/price-data";
import { formatCurrency } from "@/lib/format";

/**
 * Explains the marks of the matrix; each is a shape, not only a colour. The month marks are
 * listed only when a month carries them.
 */
export function MatrixLegend({
  incomplete = false,
  partial = false,
}: {
  incomplete?: boolean;
  partial?: boolean;
}) {
  const { t, i18n } = useTranslation("common");
  const fee = latestPrices(PRICE_DATA).switchingFee;
  return (
    <ul
      aria-label={t("result.matrix.legend.title")}
      className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground"
    >
      <li className="flex items-center gap-2">
        <span className="flex h-6 items-center gap-1 rounded-md bg-best-surface px-1.5 font-semibold text-foreground">
          <Check className="size-3.5 text-best" aria-hidden="true" />
          <span aria-hidden="true">12</span>
        </span>
        {t("result.matrix.legend.cheapest")}
      </li>
      <li className="flex items-center gap-2">
        <span className="flex h-6 items-center gap-1 rounded-md px-1.5 text-foreground ring-2 ring-foreground/75 ring-inset">
          <UserRound className="size-3.5" aria-hidden="true" />
          <span aria-hidden="true">12</span>
        </span>
        {t("result.matrix.legend.actual")}
      </li>
      <li className="flex items-center gap-2">
        <svg aria-hidden="true" width="36" height="12" className="text-foreground">
          <path
            d="M4 6H32"
            stroke="currentColor"
            strokeOpacity={0.45}
            strokeWidth={1.5}
            fill="none"
          />
          <circle cx="6" cy="6" r="4" fill="currentColor" />
          <circle cx="30" cy="6" r="4" fill="currentColor" />
        </svg>
        {t("result.matrix.legend.path")}
      </li>
      <li className="flex items-center gap-2">
        <ArrowLeftRight className="size-3.5 text-foreground" aria-hidden="true" />
        {t("result.matrix.legend.switch", {
          amount: formatCurrency(fee, i18n.language, { decimals: fee % 100 === 0 ? 0 : 2 }),
        })}
      </li>
      {incomplete && (
        <li className="flex items-center gap-2">
          <Hourglass className="size-3.5 text-foreground" aria-hidden="true" />
          {t("result.matrix.legend.incomplete")}
        </li>
      )}
      {partial && (
        <li className="flex items-center gap-2">
          <CircleDashed className="size-3.5 text-foreground" aria-hidden="true" />
          {t("result.matrix.legend.partial")}
        </li>
      )}
    </ul>
  );
}
