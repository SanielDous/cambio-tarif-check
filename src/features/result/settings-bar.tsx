import { useId, useMemo } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { ArrowRight, Minus, Plus, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { monthRange } from "@/domain/analysis/months";
import { monthKey } from "@/domain/pricing/local-time";
import { formatMonth } from "@/lib/format";
import {
  analysisAtom,
  autoDriversAtom,
  setAdditionalDriversAtom,
  settingsAtom,
  tripsAtom,
} from "@/state/atoms";

const MAX_DRIVERS = 9;

/** All months from the first to the last imported trip, independent of the chosen period. */
export function useAvailableMonths(): string[] {
  const trips = useAtomValue(tripsAtom);
  return useMemo(() => {
    const keys = trips.map((trip) => monthKey(trip.end)).sort();
    const first = keys[0];
    const last = keys[keys.length - 1];
    return first && last ? monthRange(first, last) : [];
  }, [trips]);
}

function DriversStepper() {
  const { t } = useTranslation("common");
  const n = useAtomValue(settingsAtom).additionalDrivers;
  const set = useSetAtom(setAdditionalDriversAtom);
  const autoDrivers = useAtomValue(autoDriversAtom);
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-sm font-medium">
        {t("result.settings.drivers")}
      </span>
      <div role="group" aria-labelledby={id} className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-9"
          aria-label={t("result.settings.fewerDrivers")}
          disabled={n <= 0}
          onClick={() => set(n - 1)}
        >
          <Minus />
        </Button>
        <output
          aria-live="polite"
          className="w-8 text-center text-base font-semibold tabular-nums"
          data-testid="drivers-value"
        >
          {n}
        </output>
        <Button
          variant="outline"
          size="icon"
          className="size-9"
          aria-label={t("result.settings.moreDrivers")}
          disabled={n >= MAX_DRIVERS}
          onClick={() => set(n + 1)}
        >
          <Plus />
        </Button>
      </div>
      {autoDrivers > 0 && n === autoDrivers && (
        <span className="text-xs text-muted-foreground">{t("result.settings.driversAuto")}</span>
      )}
    </div>
  );
}

function Under26Switch() {
  const { t } = useTranslation("common");
  const [settings, setSettings] = useAtom(settingsAtom);
  const analysis = useAtomValue(analysisAtom);
  const id = useId();
  const drivers = settings.additionalDrivers > 0;
  // Campus trips in the export make Campus a compared tariff whatever the switch says.
  const campusTrips =
    !drivers && (analysis?.trips.some((r) => r.trip.tariff === "CAMPUS") ?? false);
  const disabled = drivers || campusTrips;
  const hint = drivers
    ? t("result.settings.under26Hint")
    : campusTrips
      ? t("result.settings.under26Campus")
      : null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-9 items-center gap-2 sm:mt-[1.625rem]">
        <Switch
          id={id}
          checked={campusTrips || (settings.under26 && !drivers)}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onCheckedChange={(checked) => setSettings({ ...settings, under26: checked })}
        />
        <label htmlFor={id} className="text-sm font-medium has-disabled:opacity-50">
          {t("result.settings.under26")}
        </label>
      </div>
      {hint && (
        <span id={`${id}-hint`} className="max-w-56 text-xs text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  );
}

function PeriodSelect() {
  const { t, i18n } = useTranslation("common");
  const [settings, setSettings] = useAtom(settingsAtom);
  const months = useAvailableMonths();
  const id = useId();
  const first = months[0] ?? "";
  const last = months[months.length - 1] ?? "";
  const from = settings.period?.from ?? first;
  const to = settings.period?.to ?? last;

  const setPeriod = (next: { from: string; to: string }) => {
    const whole = next.from === first && next.to === last;
    setSettings({ ...settings, period: whole ? null : next });
  };
  const options = months.map((m) => (
    <option key={m} value={m}>
      {formatMonth(m, i18n.language, "short")}
    </option>
  ));

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{t("result.settings.period")}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`${id}-from`}>
          {t("result.settings.from")}
        </label>
        <div className="w-32">
          <NativeSelect
            id={`${id}-from`}
            value={from}
            onChange={(e) => {
              const value = e.target.value;
              setPeriod({ from: value, to: value > to ? value : to });
            }}
          >
            {options}
          </NativeSelect>
        </div>
        <span aria-hidden="true" className="text-muted-foreground">
          –
        </span>
        <label className="sr-only" htmlFor={`${id}-to`}>
          {t("result.settings.to")}
        </label>
        <div className="w-32">
          <NativeSelect
            id={`${id}-to`}
            value={to}
            onChange={(e) => {
              const value = e.target.value;
              setPeriod({ from: value < from ? value : from, to: value });
            }}
          >
            {options}
          </NativeSelect>
        </div>
        {settings.period && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettings({ ...settings, period: null })}
          >
            <RotateCcw />
            {t("result.settings.allMonths")}
          </Button>
        )}
      </div>
    </fieldset>
  );
}

/** What the comparison depends on besides the trips; every change recomputes everything. */
export function SettingsBar() {
  const { t } = useTranslation("common");
  return (
    <section
      aria-labelledby="settings-title"
      className="flex flex-col gap-4 rounded-xl border bg-card px-5 py-4 text-card-foreground sm:px-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="settings-title" className="text-base font-semibold">
          {t("result.settings.title")}
        </h2>
        <a
          href="#/how-it-works"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("result.settings.prices")}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </a>
      </div>
      <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
        <DriversStepper />
        <Under26Switch />
        <PeriodSelect />
      </div>
    </section>
  );
}
