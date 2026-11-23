import { useId, useState, type FormEvent } from "react";
import { useAtom } from "jotai";
import { PenLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TripResult } from "@/domain/analysis/analyze";
import { MAX_BOOKING_MINUTES } from "@/domain/analysis/reconstruct-booking";
import { dateParts } from "@/domain/pricing/local-time";
import type { LocalMinute } from "@/domain/pricing/types";
import { formatDateTime, formatTime } from "@/lib/format";
import { settingsAtom } from "@/state/atoms";
import { parseBookedEnd, toDateValue } from "./booked-end";

const QUARTER = 15;
/** Minutes of the day in quarter-hour steps: 0, 15, …, 1425. */
const QUARTERS = Array.from({ length: 96 }, (_, i) => i * QUARTER);

function minuteOfDay(t: LocalMinute) {
  const p = dateParts(t);
  return p.hour * 60 + p.minute;
}

function EditorForm({ result, onDone }: { result: TripResult; onDone: () => void }) {
  const { t, i18n } = useTranslation("common");
  const lang = i18n.language;
  const [settings, setSettings] = useAtom(settingsAtom);
  const { trip, reconstruction } = result;
  const current = settings.manualBookedEnds[trip.id];
  // Any quarter hour after the start: one before the return makes the rest a late return.
  const min = Math.floor(trip.start / QUARTER) * QUARTER + QUARTER;
  const max = trip.start + MAX_BOOKING_MINUTES;
  const initial = current ?? Math.max(min, reconstruction.bookedEnd);
  const [date, setDate] = useState(toDateValue(initial));
  const [time, setTime] = useState(minuteOfDay(initial));
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  // An inferred late return: the export's end is the booked end, the return only a guess.
  const inferred = reconstruction.kind === "overrun" && reconstruction.overrunInferred;

  const save = (value: LocalMinute | null) => {
    const ends = { ...settings.manualBookedEnds };
    if (value === null) delete ends[trip.id];
    else ends[trip.id] = value;
    setSettings({ ...settings, manualBookedEnds: ends });
    onDone();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseBookedEnd(date, time, min, max);
    if (parsed.ok) return save(parsed.value);
    const limit = parsed.error === "tooLate" ? max : min;
    setError(t(`result.bookedEnd.${parsed.error}`, { time: formatDateTime(limit, lang) }));
  };

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("result.bookedEnd.title")}</p>
        <p className="text-xs text-muted-foreground">
          {inferred
            ? t("result.bookedEnd.inferred", {
                booked: formatDateTime(reconstruction.bookedEnd, lang),
                returned: formatDateTime(
                  reconstruction.bookedEnd + reconstruction.overrunMinutes,
                  lang,
                ),
              })
            : t("result.bookedEnd.description", { time: formatDateTime(trip.end, lang) })}
        </p>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="grid gap-1">
          <label htmlFor={`${id}-date`} className="text-xs font-medium">
            {t("result.bookedEnd.date")}
          </label>
          <input
            id={`${id}-date`}
            type="date"
            value={date}
            min={toDateValue(min)}
            max={toDateValue(max)}
            onChange={(e) => {
              setDate(e.target.value);
              setError(null);
            }}
            aria-invalid={error !== null}
            aria-describedby={error ? `${id}-error` : undefined}
            className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring aria-invalid:border-destructive"
          />
        </div>
        <div className="grid w-28 gap-1">
          <label htmlFor={`${id}-time`} className="text-xs font-medium">
            {t("result.bookedEnd.time")}
          </label>
          <NativeSelect
            id={`${id}-time`}
            value={time}
            onChange={(e) => {
              setTime(Number(e.target.value));
              setError(null);
            }}
            aria-invalid={error !== null}
            aria-describedby={error ? `${id}-error` : undefined}
          >
            {QUARTERS.map((q) => (
              <option key={q} value={q}>
                {formatTime(q, lang)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {inferred && (
          <Button type="button" variant="outline" size="sm" onClick={() => save(trip.end)}>
            {t("result.bookedEnd.noOverrun")}
          </Button>
        )}
        {current !== undefined && (
          <Button type="button" variant="ghost" size="sm" onClick={() => save(null)}>
            {t("result.bookedEnd.clear")}
          </Button>
        )}
        <Button type="submit" size="sm">
          {t("result.bookedEnd.apply")}
        </Button>
      </div>
    </form>
  );
}

/** Lets the user enter the booked end of a trip the export does not determine. */
export function BookedEndEditor({ result }: { result: TripResult }) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const manual = result.reconstruction.kind === "manual";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <PenLine />
          {t(manual ? "result.bookedEnd.edit" : "result.bookedEnd.open")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <EditorForm result={result} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
