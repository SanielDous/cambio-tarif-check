import { useEffect, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useImportFiles } from "./use-import-files";

/**
 * While files are dragged over the page, dragover fires every few dozen milliseconds even if the
 * pointer rests. Silence this long means the drag is over, whether or not an event said so.
 */
const DRAG_WATCHDOG_MS = 400;

const carriesFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

/**
 * Makes the whole page a drop target for files: without it the browser opens a file dropped
 * next to the drop zone and every loaded trip is gone. Drops the drop zone handles itself are
 * left to it. A full-page overlay shows while files are dragged over the page.
 */
export function PageDrop({ onFiles }: { onFiles?: () => void }) {
  const { t } = useTranslation("common");
  const { importFiles } = useImportFiles();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    // dragenter and dragleave fire for every element crossed; the depth tells when the drag
    // has really left the window. Browsers do not always balance them, so several other signals
    // hide the overlay too, and a watchdog ends it when the steady stream of dragover stops.
    let depth = 0;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const hide = () => {
      depth = 0;
      clearTimeout(watchdog);
      watchdog = undefined;
      setDragging(false);
    };
    const keepAlive = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(hide, DRAG_WATCHDOG_MS);
    };
    const onEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth++;
      setDragging(true);
      keepAlive();
    };
    const onLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      // No related target: the drag has left the window, whatever the depth says.
      if (depth === 0 || event.relatedTarget === null) hide();
    };
    const onOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      keepAlive();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    const onDrop = (event: DragEvent) => {
      hide();
      if (!carriesFiles(event)) return;
      // The drop zone has already taken these files.
      if (event.defaultPrevented) return;
      event.preventDefault();
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        importFiles(files);
        onFiles?.();
      }
    };
    const listeners = [
      ["dragenter", onEnter],
      ["dragleave", onLeave],
      ["dragover", onOver],
      ["drop", onDrop],
      ["dragend", hide],
      ["blur", hide],
      ["keydown", onKey],
    ] as const;
    for (const [type, listener] of listeners) {
      window.addEventListener(type, listener as EventListener);
    }
    return () => {
      for (const [type, listener] of listeners) {
        window.removeEventListener(type, listener as EventListener);
      }
      clearTimeout(watchdog);
    };
  }, [importFiles, onFiles]);

  if (!dragging) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="page-drop-overlay"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary bg-card px-10 py-8 text-center text-card-foreground shadow-lg">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FileSpreadsheet className="size-7" />
        </span>
        <span className="text-lg font-medium">{t("import.dropzone.release")}</span>
        <span className="max-w-sm text-sm text-muted-foreground">{t("import.pageDrop.hint")}</span>
      </div>
    </div>
  );
}
