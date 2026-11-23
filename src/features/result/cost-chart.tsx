import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Analysis } from "@/domain/analysis/analyze";
import type { TariffId } from "@/domain/pricing/types";
import { formatCurrency, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { tariffColor, tariffColorVar } from "./tariffs";

const HEIGHT = 280;
const ACTUAL = "actual";

type Series = TariffId | typeof ACTUAL;

/** Re-renders when the theme class on the root element changes. */
function useThemeClass(): string {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributeFilter: ["class"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.className,
  );
}

/** Resolved colours of the CSS variables; SVG attributes cannot take `var()` everywhere. */
function useColors(series: Series[]) {
  const theme = useThemeClass();
  return useMemo(() => {
    void theme;
    const style = getComputedStyle(document.documentElement);
    const read = (name: string) => style.getPropertyValue(name).trim() || "currentColor";
    const colors = Object.fromEntries(
      series.map((s) => [s, read(s === ACTUAL ? "--tariff-actual" : tariffColorVar(s))]),
    ) as Record<Series, string>;
    return {
      series: colors,
      grid: read("--chart-grid"),
      axis: read("--chart-axis"),
      surface: read("--card"),
    };
  }, [series, theme]);
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: readonly { dataKey?: unknown; value?: unknown; color?: string }[];
}

/** Monthly (or cumulative) cost per compared tariff and the actual cost, as lines. */
export default function CostChart({
  analysis,
  describedBy,
}: {
  analysis: Analysis;
  describedBy: string;
}) {
  const { t, i18n } = useTranslation("common");
  const lang = i18n.language;
  const [mode, setMode] = useState<"monthly" | "cumulative">("cumulative");
  const series = useMemo<Series[]>(() => [...analysis.tariffs, ACTUAL], [analysis.tariffs]);
  const colors = useColors(series);
  const { ref, width } = useWidth();

  const data = useMemo(() => {
    const sums: Record<string, number> = {};
    return analysis.months.map((m) => {
      const row: Record<string, number | string> = { month: m.month };
      for (const s of series) {
        const cents = s === ACTUAL ? m.actualCost : (m.costs[s] ?? 0);
        sums[s] = (sums[s] ?? 0) + cents;
        row[s] = (mode === "cumulative" ? (sums[s] ?? 0) : cents) / 100;
      }
      return row;
    });
  }, [analysis.months, series, mode]);

  const name = (s: Series) => (s === ACTUAL ? t("result.matrix.actual") : t(`tariffs.${s}`));
  const euros = (value: number, decimals: 0 | 2) =>
    formatCurrency(Math.round(value * 100), lang, { decimals });
  const narrow = width < 520;

  const renderTooltip = ({ active, label, payload }: TooltipProps) => {
    if (!active || !payload?.length) return null;
    const rows = [...payload].sort((a, b) => Number(a.value) - Number(b.value));
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
        <p className="mb-1 font-medium">{formatMonth(String(label), lang)}</p>
        <ul className="grid gap-0.5">
          {rows.map((row) => (
            <li key={String(row.dataKey)} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-0.5 w-3 rounded-full"
                style={{ background: row.color }}
              />
              <span className="flex-1">{name(row.dataKey as Series)}</span>
              <span className="tabular-nums">{euros(Number(row.value), 2)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <figure className="flex min-w-0 flex-col gap-3" aria-describedby={describedBy}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
          aria-label={t("result.chart.legend")}
        >
          {series.map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <svg aria-hidden="true" width="16" height="4" className="overflow-visible">
                <line
                  x1="0"
                  y1="2"
                  x2="16"
                  y2="2"
                  strokeWidth={s === ACTUAL ? 3.5 : 2}
                  style={{ stroke: s === ACTUAL ? "var(--tariff-actual)" : tariffColor(s) }}
                />
              </svg>
              {name(s)}
            </li>
          ))}
        </ul>
        <div
          role="group"
          aria-label={t("result.chart.view")}
          className="inline-flex rounded-md border p-0.5 text-xs"
        >
          {(["cumulative", "monthly"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-sm px-2.5 py-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                mode === m ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {t(`result.chart.${m}`)}
            </button>
          ))}
        </div>
      </div>
      <div ref={ref} style={{ height: HEIGHT }} data-testid="cost-chart">
        {width > 0 && (
          <LineChart
            width={width}
            height={HEIGHT}
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="month"
              tickFormatter={(key: string) => formatMonth(key, lang, "short")}
              interval="preserveStartEnd"
              minTickGap={12}
              tick={{ fill: colors.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: colors.grid }}
            />
            <YAxis
              width={narrow ? 48 : 64}
              tickFormatter={(value: number) => euros(value, 0)}
              tick={{ fill: colors.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={renderTooltip} cursor={{ stroke: colors.axis, strokeWidth: 1 }} />
            {series.map((s) => (
              <Line
                key={s}
                dataKey={s}
                name={name(s)}
                type="linear"
                stroke={colors.series[s]}
                // The user's own cost: thicker neutral ink, drawn last so it lies on top.
                strokeWidth={s === ACTUAL ? 3.5 : 2}
                dot={false}
                activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </div>
    </figure>
  );
}
