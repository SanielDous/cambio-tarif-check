import { useState, type DragEvent } from "react";
import { FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useImportFiles } from "./use-import-files";

/** A labelled file input that also accepts dropped files. */
export function Dropzone() {
  const { t } = useTranslation("common");
  const { importFiles, busy } = useImportFiles();
  const [dragging, setDragging] = useState(false);

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    setDragging(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    importFiles(event.dataTransfer.files);
  };

  return (
    <label
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      aria-busy={busy}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors focus-within:ring-[3px] focus-within:ring-ring sm:py-20",
        dragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/40 bg-card hover:border-primary/60 hover:bg-accent/50",
        busy && "cursor-progress",
      )}
    >
      <input
        type="file"
        accept=".csv,.xlsx"
        multiple
        aria-label={t("import.dropzone.inputLabel")}
        className="sr-only"
        onChange={(event) => {
          importFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        {busy ? (
          <LoaderCircle className="size-7 animate-spin" aria-hidden="true" />
        ) : dragging ? (
          <FileSpreadsheet className="size-7" aria-hidden="true" />
        ) : (
          <Upload className="size-7" aria-hidden="true" />
        )}
      </span>
      <span className="text-lg font-medium">
        {busy
          ? t("import.dropzone.busy")
          : dragging
            ? t("import.dropzone.release")
            : t("import.dropzone.title")}
      </span>
      <span className="max-w-sm text-sm text-muted-foreground">{t("import.dropzone.hint")}</span>
      <span className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs">
        {t("import.dropzone.choose")}
      </span>
    </label>
  );
}
