import { CircleAlert, SkipForward } from "lucide-react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { importReportAtom } from "@/state/atoms";

/** One inline message per file that failed or was skipped; announced to screen readers. */
export function FileMessages() {
  const { t } = useTranslation("common");
  const { files } = useAtomValue(importReportAtom);
  const failed = files.filter((file) => file.error !== undefined || file.skipped);
  return (
    <div aria-live="polite" className="space-y-3" data-testid="file-messages">
      {failed.map((file) => (
        <Alert key={file.id} variant={file.error ? "destructive" : "default"}>
          {file.error ? <CircleAlert aria-hidden="true" /> : <SkipForward aria-hidden="true" />}
          <AlertTitle className="break-all">{file.fileName}</AlertTitle>
          <AlertDescription>
            {file.error ? t(`import.errors.${file.error}`) : t("import.skipped")}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
