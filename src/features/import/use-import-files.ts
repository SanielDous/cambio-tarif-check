import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { importBusyAtom, importFilesAtom } from "@/state/atoms";

/** Starts an import for a list of files and tells whether one is running. */
export function useImportFiles() {
  const run = useSetAtom(importFilesAtom);
  const busy = useAtomValue(importBusyAtom) > 0;
  const importFiles = useCallback(
    (files: FileList | File[] | null) => {
      const list = files ? Array.from(files) : [];
      if (list.length > 0) void run(list);
    },
    [run],
  );
  return { importFiles, busy };
}
