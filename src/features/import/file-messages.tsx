import { CircleAlert, FileX, SkipForward } from "lucide-react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { importReportAtom, type FileReport } from "@/state/atoms";
import { groupProblems, ProblemList } from "./problem-list";

/** A file that was read but gave no trip: says so and lists why its rows were not used. */
function NoTripsMessage({ file }: { file: FileReport }) {
  const { t } = useTranslation("common");
  return (
    <Alert data-testid="file-no-trips">
      <FileX aria-hidden="true" />
      <AlertTitle className="break-all">{file.fileName}</AlertTitle>
      <AlertDescription className="gap-2">
        <p>
          {t("import.noTrips.title")} {file.rowCount === 0 && t("import.noTrips.headerOnly")}
        </p>
        {file.problems.length > 0 && (
          <ProblemList groups={groupProblems([file])} showFileName={false} />
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * One inline message per file that failed, was skipped or gave no trip; announced to screen
 * readers.
 */
export function FileMessages() {
  const { t } = useTranslation("common");
  const { files } = useAtomValue(importReportAtom);
  return (
    <div aria-live="polite" className="space-y-3" data-testid="file-messages">
      {files.map((file) => {
        if (file.error === undefined && !file.skipped) {
          return file.tripCount === 0 ? <NoTripsMessage key={file.id} file={file} /> : null;
        }
        return (
          <Alert key={file.id} variant={file.error ? "destructive" : "default"}>
            {file.error ? <CircleAlert aria-hidden="true" /> : <SkipForward aria-hidden="true" />}
            <AlertTitle className="break-all">{file.fileName}</AlertTitle>
            <AlertDescription>
              {file.error ? t(`import.errors.${file.error}`) : t("import.skipped")}
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
