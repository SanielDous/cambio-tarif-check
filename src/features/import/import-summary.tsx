import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { FileText, Info, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { monthRange } from "@/domain/analysis/months";
import { monthKey } from "@/domain/pricing/local-time";
import { formatDate, formatMonth } from "@/lib/format";
import {
  autoDriversAtom,
  importReportAtom,
  resetAtom,
  settingsAtom,
  tripsAtom,
} from "@/state/atoms";
import { FileMessages } from "./file-messages";
import { MappingDialog } from "./mapping-dialog";
import { groupProblems, ProblemList } from "./problem-list";
import { useImportFiles } from "./use-import-files";

function ResetButton() {
  const { t } = useTranslation("common");
  const reset = useSetAtom(resetAtom);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <RotateCcw />
        {t("import.summary.startOver")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t("import.mapping.close")}>
          <DialogHeader>
            <DialogTitle>{t("import.summary.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("import.summary.confirmText")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("import.summary.confirmNo")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              {t("import.summary.confirmYes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddFileButton() {
  const { t } = useTranslation("common");
  const { importFiles, busy } = useImportFiles();
  return (
    <Button asChild variant="outline" aria-busy={busy}>
      <label className="cursor-pointer focus-within:ring-[3px] focus-within:ring-ring/50">
        <Plus />
        {t("import.summary.addFile")}
        <input
          type="file"
          accept=".csv,.xlsx"
          multiple
          className="sr-only"
          onChange={(event) => {
            importFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
    </Button>
  );
}

/** What was imported: files, trips, period, duplicates, rejected rows, gaps. */
export function ImportSummary() {
  const { t, i18n } = useTranslation("common");
  const language = i18n.language;
  const trips = useAtomValue(tripsAtom);
  const report = useAtomValue(importReportAtom);
  const { additionalDrivers } = useAtomValue(settingsAtom);
  const autoDrivers = useAtomValue(autoDriversAtom);

  const { period, missingMonths } = useMemo(() => {
    if (trips.length === 0) return { period: null, missingMonths: [] as string[] };
    const first = Math.min(...trips.map((trip) => trip.start));
    const last = Math.max(...trips.map((trip) => trip.end));
    const present = new Set(trips.map((trip) => monthKey(trip.end)));
    const months = [...present].sort();
    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];
    return {
      period: { first, last },
      missingMonths:
        firstMonth && lastMonth
          ? monthRange(firstMonth, lastMonth).filter((month) => !present.has(month))
          : [],
    };
  }, [trips]);

  // Files without any trip list their rows in their own message (FileMessages).
  const problems = useMemo(
    () => groupProblems(report.files.filter((file) => file.tripCount > 0)),
    [report],
  );
  const readFiles = report.files.filter((file) => file.error === undefined && !file.skipped);

  return (
    <section
      aria-labelledby="import-summary-title"
      className="space-y-5 rounded-xl border bg-card p-5 text-card-foreground sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="import-summary-title" className="text-lg font-semibold">
            {t("import.summary.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            <strong className="font-semibold text-foreground" data-testid="trip-count">
              {t("import.summary.trips", { count: trips.length })}
            </strong>
            {period && (
              <>
                {" · "}
                {t("import.summary.period")}: {formatDate(period.first, language)} –{" "}
                {formatDate(period.last, language)}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AddFileButton />
          <ResetButton />
        </div>
      </div>

      <div aria-live="polite" className="space-y-4">
        <ul className="grid gap-1.5 text-sm" aria-label={t("import.summary.files")}>
          {readFiles.map((file) => (
            <li key={file.id} className="flex items-center gap-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-all">{file.fileName}</span>
              <Badge variant="secondary">
                {t("import.summary.fileTrips", { count: file.tripCount })}
              </Badge>
            </li>
          ))}
        </ul>

        {report.duplicates > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("import.summary.duplicates", { count: report.duplicates })}
          </p>
        )}

        {autoDrivers > 0 && additionalDrivers === autoDrivers && (
          <Alert>
            <Info aria-hidden="true" />
            <AlertDescription>
              {t("import.summary.driversHint", { count: autoDrivers })}
            </AlertDescription>
          </Alert>
        )}

        {problems.length > 0 && (
          <Alert>
            <TriangleAlert aria-hidden="true" />
            <AlertDescription className="gap-3">
              <p className="font-medium text-foreground">{t("import.summary.problems")}</p>
              <ProblemList groups={problems} />
            </AlertDescription>
          </Alert>
        )}

        {missingMonths.length > 0 && (
          <Alert>
            <Info aria-hidden="true" />
            <AlertDescription>
              <p className="font-medium text-foreground">{t("import.summary.missingMonths")}</p>
              <p>{missingMonths.map((month) => formatMonth(month, language)).join(", ")}</p>
            </AlertDescription>
          </Alert>
        )}

        <FileMessages />
      </div>

      <p className="text-sm text-muted-foreground">{t("import.completeness")}</p>
      <MappingDialog />
    </section>
  );
}
