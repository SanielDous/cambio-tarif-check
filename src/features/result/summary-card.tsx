import { CircleCheck, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Analysis } from "@/domain/analysis/analyze";
import { PRICE_DATA, parseIsoDate } from "@/domain/pricing/price-data";
import { formatCurrency, formatDate, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Hint } from "./hint";
import type { ReconstructionKind } from "@/domain/analysis/reconstruct-booking";
import { EXACT_KINDS } from "./tariffs";

/** Kinds listed after the exact count, each only when it occurs. */
const OTHER_KINDS: ReconstructionKind[] = [
  "verified-rounding",
  "estimated",
  "manual",
  "not-reproducible",
];

type Headline = "alreadyBest" | "saving" | "equal" | "switchingWon" | "cheaperThanBest";

/** Which of the possible answers applies. */
export function headlineCase(analysis: Analysis): Headline {
  const best = analysis.bestSingle.tariff;
  if (analysis.months.every((m) => m.actualTariff === best)) return "alreadyBest";
  const { saving } = analysis.bestSingle;
  if (saving > 0) return "saving";
  if (saving === 0) return "equal";
  return analysis.months.some((m) => m.switched) ? "switchingWon" : "cheaperThanBest";
}

function Total({
  label,
  amount,
  note,
  emphasis = false,
  testId,
}: {
  label: string;
  amount: string;
  note: string;
  emphasis?: boolean;
  testId: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-3 sm:p-4",
        emphasis ? "border-foreground/25 bg-background" : "bg-muted/40",
      )}
      data-testid={testId}
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        data-testid={`${testId}-amount`}
        className="text-xl font-semibold sm:text-2xl tracking-tight tabular-nums"
      >
        {amount}
      </dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

/** The answer: best single tariff, the three totals, how well the trips were recomputed. */
export function SummaryCard({ analysis }: { analysis: Analysis }) {
  const { t, i18n } = useTranslation("common");
  const lang = i18n.language;
  const money = (cents: number) => formatCurrency(cents, lang);
  const { bestSingle, optimalPath, actualTotal, months } = analysis;
  const tariff = t(`tariffs.${bestSingle.tariff}`);
  const kind = headlineCase(analysis);
  const amount = money(Math.abs(bestSingle.saving));

  const diff = (total: number) => {
    const d = total - actualTotal;
    if (d === 0) return t("result.summary.diff.same");
    return t(d > 0 ? "result.summary.diff.more" : "result.summary.diff.less", {
      amount: money(Math.abs(d)),
    });
  };

  const total = analysis.trips.length;
  const exact = EXACT_KINDS.reduce((s, k) => s + analysis.verification[k], 0);
  const others = OTHER_KINDS.filter((k) => analysis.verification[k] > 0).map((k) =>
    t(`result.summary.verificationParts.${k}`, { count: analysis.verification[k] }),
  );
  const hindsight = actualTotal - optimalPath.total;
  const sub = kind === "alreadyBest" && hindsight > 0 ? "alreadyBestHindsight" : kind;
  const first = months[0]?.month ?? "";
  const last = months[months.length - 1]?.month ?? "";

  return (
    <section
      aria-labelledby="result-headline"
      className="space-y-6 rounded-xl border bg-card p-5 text-card-foreground sm:p-7"
      data-testid="summary"
    >
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {t("result.summary.scope", {
            from: formatMonth(first, lang, "short"),
            to: formatMonth(last, lang, "short"),
            trips: t("import.summary.trips", { count: total }),
          })}
        </p>
        <h2
          id="result-headline"
          className="text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl"
          data-testid="headline"
        >
          {t(`result.summary.headline.${kind}`, { tariff, amount })}
        </h2>
        <p className="max-w-prose text-muted-foreground">
          {t(`result.summary.sub.${sub}`, {
            tariff,
            actual: money(actualTotal),
            best: money(bestSingle.total),
            hindsight: money(hindsight),
          })}
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Total
          testId="total-actual"
          label={t("result.summary.actual.label")}
          amount={money(actualTotal)}
          note={t("result.summary.actual.note")}
          emphasis
        />
        <Total
          testId="total-best"
          label={t("result.summary.best.label", { tariff })}
          amount={money(bestSingle.total)}
          note={diff(bestSingle.total)}
        />
        <Total
          testId="total-optimal"
          label={t("result.summary.optimal.label", {
            switches: t("result.summary.optimal.switches", { count: optimalPath.switches }),
          })}
          amount={money(optimalPath.total)}
          note={`${diff(optimalPath.total)} · ${t("result.summary.optimal.note")}`}
        />
      </dl>

      <div className="flex flex-col gap-x-6 gap-y-2 text-sm sm:flex-row sm:flex-wrap sm:items-center">
        <Hint content={t("result.summary.verificationHint")}>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid="verification"
          >
            <CircleCheck className="size-4 shrink-0 text-best" aria-hidden="true" />
            <span className="underline decoration-dotted underline-offset-4">
              {t("result.summary.verification", { exact, count: total })}
            </span>
          </button>
        </Hint>
        {others.length > 0 && (
          <span className="text-muted-foreground" data-testid="verification-others">
            {others.join(" · ")}
          </span>
        )}
        <span className="text-muted-foreground tabular-nums">
          {t("result.summary.deviation", {
            amount: formatCurrency(analysis.recomputationDeviation, lang, { signed: true }),
          })}
        </span>
      </div>

      <Warnings analysis={analysis} />
    </section>
  );
}

function Warnings({ analysis }: { analysis: Analysis }) {
  const { t, i18n } = useTranslation("common");
  const lang = i18n.language;
  const list = (keys: string[]) => keys.map((m) => formatMonth(m, lang, "short")).join(", ");
  const mixed = analysis.months.filter((m) => m.actualTariffMixed).map((m) => m.month);
  const inherited = analysis.months
    .filter((m) => m.actualTariffSource === "inherited")
    .map((m) => m.month);
  const incomplete = analysis.months.filter((m) => m.incomplete).map((m) => m.month);
  const open = analysis.verification.estimated + analysis.verification["not-reproducible"];

  const items: string[] = [];
  if (open > 0) items.push(t("result.summary.warnings.open", { count: open }));
  if (analysis.surchargeDerivedTrips > 0) {
    items.push(t("result.summary.warnings.surcharge", { count: analysis.surchargeDerivedTrips }));
  }
  if (analysis.tripsAfterPricesAsOf > 0) {
    items.push(
      t("result.summary.warnings.afterPrices", {
        count: analysis.tripsAfterPricesAsOf,
        date: formatDate(parseIsoDate(PRICE_DATA.pricesAsOf), lang),
      }),
    );
  }
  if (mixed.length > 0) items.push(t("result.summary.warnings.mixed", { months: list(mixed) }));
  if (inherited.length > 0) {
    items.push(t("result.summary.warnings.inherited", { months: list(inherited) }));
  }
  if (incomplete.length > 0) {
    items.push(t("result.summary.warnings.incomplete", { months: list(incomplete) }));
  }
  if (items.length === 0) return null;

  return (
    <div className="border-t pt-4">
      <h3 className="sr-only">{t("result.summary.warnings.title")}</h3>
      <ul className="grid gap-2 text-sm text-muted-foreground" data-testid="warnings">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
