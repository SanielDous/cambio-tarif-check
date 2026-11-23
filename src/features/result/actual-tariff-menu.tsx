import { useAtom } from "jotai";
import { ChevronDown, PenLine, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MonthRow } from "@/domain/analysis/analyze";
import type { TariffId } from "@/domain/pricing/types";
import { formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { settingsAtom } from "@/state/atoms";
import { ALL_TARIFFS, tariffColor } from "./tariffs";

/** Where the actual tariff of a month comes from, as shown below its name. */
function sourceKey(row: MonthRow): "inherited" | "override" | "mixed" | null {
  if (row.actualTariffSource === "inherited" || row.actualTariffSource === "override") {
    return row.actualTariffSource;
  }
  return row.actualTariffMixed ? "mixed" : null;
}

/**
 * The user's tariff in one month, with a menu to correct it. Inherited months are labelled as
 * assumed, corrections as set by hand; a correction can be removed again.
 */
export function ActualTariffMenu({ row }: { row: MonthRow }) {
  const { t, i18n } = useTranslation("common");
  const [settings, setSettings] = useAtom(settingsAtom);
  const month = formatMonth(row.month, i18n.language);
  const tariff = t(`tariffs.${row.actualTariff}`);
  const source = sourceKey(row);
  const sourceLabel = source ? t(`result.matrix.source.${source}`) : null;

  const setOverride = (value: TariffId | null) => {
    const overrides = { ...settings.actualTariffOverrides };
    if (value === null) delete overrides[row.month];
    else overrides[row.month] = value;
    setSettings({ ...settings, actualTariffOverrides: overrides });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full flex-col items-end rounded-md px-2 py-1 text-right outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent",
            row.actualTariffSource === "inherited" && "text-muted-foreground",
          )}
          aria-label={t("result.matrix.change", {
            month,
            tariff: sourceLabel ? `${tariff} (${sourceLabel})` : tariff,
          })}
          data-testid={`actual-tariff-${row.month}`}
          data-source={row.actualTariffSource}
        >
          <span className="flex items-center gap-1 text-xs font-medium">
            {row.actualTariffSource === "override" && (
              <PenLine className="size-3" aria-hidden="true" />
            )}
            <span className={cn(row.actualTariffSource === "inherited" && "italic")}>{tariff}</span>
            <ChevronDown className="size-3 opacity-60" aria-hidden="true" />
          </span>
          {sourceLabel && (
            <span className="text-[0.6875rem] leading-tight text-muted-foreground">
              {sourceLabel}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t("result.matrix.menuLabel", { month })}</DropdownMenuLabel>
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          {t(`result.matrix.sourceHint.${source ?? "trips"}`)}
        </p>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={row.actualTariff}
          onValueChange={(value) => {
            if (value !== row.actualTariff) {
              setOverride(value as TariffId);
            }
          }}
        >
          {ALL_TARIFFS.map((id) => (
            <DropdownMenuRadioItem key={id} value={id}>
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{ background: tariffColor(id) }}
              />
              {t(`tariffs.${id}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {row.actualTariffSource === "override" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setOverride(null)}>
              <RotateCcw />
              {t("result.matrix.resetOverride")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
