import { useId, useState, type FormEvent } from "react";
import { useAtom } from "jotai";
import { PenLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TripResult } from "@/domain/analysis/analyze";
import { dateParts, toLocalMinute } from "@/domain/pricing/local-time";
import type { LocalMinute } from "@/domain/pricing/types";
import { formatDateTime, formatTime } from "@/lib/format";
import { settingsAtom } from "@/state/atoms";

const QUARTER = 15;
const pad = (n: number) => String(n).padStart(2, "0");
/** Minutes of the day in quarter-hour steps: 0, 15, …, 1425. */
const QUARTERS = Array.from({ length: 96 }, (_, i) => i * QUARTER);

function toFields(t: LocalMinute) {
  const p = dateParts(t);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: p.hour * 60 + p.minute };
}

function fromFields(date: string, time: number): LocalMinute | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return toLocalMinute(y, m, d) + time;
}

function EditorForm({ result, onDone }: { result: TripResult; onDone: () => void }) {
  const { t, i18n } = useTranslation("common");
  const lang = i18n.language;
  const [settings, setSettings] = useAtom(settingsAtom);
  const { trip, reconstruction } = result;
  const current = settings.manualBookedEnds[trip.id];
  const min = reconstruction.chargedUntil;
  const initial = toFields(current ?? Math.max(min, reconstruction.bookedEnd));
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const save = (value: LocalMinute | null) => {
    const ends = { ...settings.manualBookedEnds };
    if (value === null) delete ends[trip.id];
    else ends[trip.id] = value;
    setSettings({ ...settings, manualBookedEnds: ends });
    onDone();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = fromFields(date, time);
    if (value === null) return setError(t("result.bookedEnd.invalid"));
    if (value < min) {
      return setError(t("result.bookedEnd.tooEarly", { time: formatDateTime(min, lang) }));
    }
    save(value);
  };

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("result.bookedEnd.title")}</p>
        <p className="text-xs text-muted-foreground">
          {t("result.bookedEnd.description", { time: formatDateTime(min, lang) })}
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
            onChange={(e) => {
              setDate(e.target.value);
              setError(null);
            }}
            aria-invalid={error !== null}
            aria-describedby={error ? `${id}-error` : undefined}
            className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
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
