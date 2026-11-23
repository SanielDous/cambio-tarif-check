import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ReconstructionKind } from "@/domain/analysis/reconstruct-booking";
import { PRICE_DATA, parseIsoDate } from "@/domain/pricing/price-data";
import type { PriceData, TariffId } from "@/domain/pricing/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { REPOSITORY_URL } from "@/lib/links";
import { PriceTables } from "./price-table";

/** The reconstruction kinds in the order they are explained. */
const KINDS: ReconstructionKind[] = [
  "verified",
  "verified-rounding",
  "estimated",
  "manual",
  "cancelled",
  "unused",
  "overrun",
  "not-reproducible",
];

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** Weekday name for ISO weekday numbers (1 = Monday); 2024-01-01 was a Monday. */
function weekdayName(weekday: number, language: string): string {
  return new Intl.DateTimeFormat(language, { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, weekday)),
  );
}

/** Tariffs that have a separate weekend price for at least one class. */
function weekendTariffs(data: PriceData): TariffId[] {
  return (Object.keys(data.tariffs) as TariffId[]).filter((id) =>
    Object.values(data.tariffs[id].prices).some((price) => price.hourWeekend !== price.hourWeekday),
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

const prose = "max-w-prose leading-relaxed";

function List({ children }: { children: ReactNode }) {
  return <ul className="max-w-prose list-disc space-y-1.5 pl-5 leading-relaxed">{children}</ul>;
}

/** The explanation page: how the comparison works, what it leaves out, the price list. */
export function HowItWorksView({ data = PRICE_DATA }: { data?: PriceData }) {
  const { t, i18n } = useTranslation("common");
  const lang = i18n.language;
  const date = (iso: string) => formatDate(parseIsoDate(iso), lang);
  const tripParams = {
    weekendTariffs: new Intl.ListFormat(lang, { style: "long", type: "conjunction" }).format(
      weekendTariffs(data).map((id) => t(`tariffs.${id}`)),
    ),
    nightFrom: hourLabel(data.nightStartHour),
    nightTo: hourLabel(data.nightEndHour),
    nightPrice: formatCurrency(data.nightHourPrice, lang),
    weekendFromDay: weekdayName(data.weekendStart.weekday, lang),
    weekendFromTime: hourLabel(data.weekendStart.hour),
    weekendToDay: weekdayName(data.weekendEnd.weekday, lang),
    weekendToTime: hourLabel(data.weekendEnd.hour),
    dayCapHours: data.dayCapHours,
    weekCapDays: data.weekCapDays,
    kmBoundary: data.kmTierBoundary,
  };

  return (
    <article className="max-w-4xl space-y-10 pb-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("howItWorks.title")}</h1>
        <p className="max-w-prose text-muted-foreground">{t("howItWorks.intro")}</p>
      </header>

      <Section id="hiw-what" title={t("howItWorks.whatItDoes.title")}>
        <p className={prose}>{t("howItWorks.whatItDoes.body")}</p>
        <p className={prose}>{t("howItWorks.whatItDoes.hindsight")}</p>
      </Section>

      <Section id="hiw-data" title={t("howItWorks.data.title")}>
        <p className={prose}>{t("howItWorks.data.source")}</p>
        <p className={prose}>{t("howItWorks.data.privacy")}</p>
      </Section>

      <Section id="hiw-trip" title={t("howItWorks.trip.title")}>
        <p className={prose}>{t("howItWorks.trip.intro")}</p>
        <List>
          {(["time", "night", "weekend", "caps", "km"] as const).map((key) => (
            <li key={key}>{t(`howItWorks.trip.${key}`, tripParams)}</li>
          ))}
        </List>
      </Section>

      <Section id="hiw-early" title={t("howItWorks.earlyReturn.title")}>
        <p className={prose}>{t("howItWorks.earlyReturn.export")}</p>
        <p className={prose}>{t("howItWorks.earlyReturn.reconstruction")}</p>
        <p className={prose}>{t("howItWorks.earlyReturn.late")}</p>
        <p className={prose}>{t("howItWorks.earlyReturn.ambiguous")}</p>
      </Section>

      <Section id="hiw-kinds" title={t("howItWorks.kinds.title")}>
        <p className={prose}>{t("howItWorks.kinds.intro")}</p>
        <dl className="max-w-prose space-y-2" data-testid="kinds-list">
          {KINDS.map((kind) => (
            <div key={kind}>
              <dt className="font-medium">{t(`result.kinds.${kind}.label`)}</dt>
              <dd className="text-muted-foreground">
                {t(
                  kind === "overrun" ? "result.kinds.overrun.general" : `result.kinds.${kind}.text`,
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className={prose}>{t("howItWorks.kinds.rounding")}</p>
      </Section>

      <Section id="hiw-months" title={t("howItWorks.months.title")}>
        <p className={prose}>{t("howItWorks.months.month")}</p>
        <p className={prose}>
          {t("howItWorks.months.actual", { switchingFee: formatCurrency(data.switchingFee, lang) })}
        </p>
        <p className={prose}>{t("howItWorks.months.path")}</p>
      </Section>

      <Section id="hiw-limits" title={t("howItWorks.limits.title")}>
        <p className={prose}>{t("howItWorks.limits.intro")}</p>
        <List>
          {(
            [
              "discounts",
              "signup",
              "sipack",
              "credit",
              "lateFees",
              "penalties",
              "business",
            ] as const
          ).map((key) => (
            <li key={key}>{t(`howItWorks.limits.${key}`)}</li>
          ))}
          <li>{t("howItWorks.limits.before", { date: date(data.validFrom) })}</li>
        </List>
        <p className={prose}>{t("howItWorks.limits.holidays")}</p>
        <p className={prose}>{t("howItWorks.limits.cap")}</p>
      </Section>

      <Section id="hiw-prices" title={t("howItWorks.prices.title")}>
        <p className={prose}>
          {t("howItWorks.prices.asOf", { date: date(data.pricesAsOf) })}{" "}
          {t("howItWorks.prices.outdated")}
        </p>
        <p className={prose}>{t("howItWorks.prices.vat")}</p>
        <PriceTables data={data} />
      </Section>

      <Section id="hiw-disclaimer" title={t("howItWorks.disclaimer.title")}>
        <p className={prose}>{t("howItWorks.disclaimer.body")}</p>
        <p className={prose}>
          {t("howItWorks.disclaimer.source")}{" "}
          <a
            className="underline underline-offset-4"
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
          >
            {t("footer.repository")}
          </a>
        </p>
      </Section>
    </article>
  );
}
