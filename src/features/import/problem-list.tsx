import { useTranslation } from "react-i18next";
import type { RowProblem } from "@/domain/import/fields";
import { formatNumber } from "@/lib/format";
import type { FileReport } from "@/state/atoms";

const MAX_LISTED_ROWS = 25;

type Reason = RowProblem["reason"];

export interface ProblemGroup {
  reason: Reason;
  count: number;
  files: { id: number; fileName: string; rows: number[] }[];
}

/** Problems by reason, then by file, with their row numbers in ascending order. */
export function groupProblems(reports: FileReport[]): ProblemGroup[] {
  const byReason = new Map<Reason, Map<number, { fileName: string; rows: number[] }>>();
  for (const report of reports) {
    for (const problem of report.problems) {
      const files =
        byReason.get(problem.reason) ?? new Map<number, { fileName: string; rows: number[] }>();
      const entry = files.get(report.id) ?? { fileName: report.fileName, rows: [] };
      entry.rows.push(problem.rowNumber);
      files.set(report.id, entry);
      byReason.set(problem.reason, files);
    }
  }
  return [...byReason].map(([reason, files]) => ({
    reason,
    count: [...files.values()].reduce((sum, file) => sum + file.rows.length, 0),
    files: [...files].map(([id, file]) => ({ id, ...file, rows: file.rows.sort((x, y) => x - y) })),
  }));
}

/**
 * Rejected rows by reason with their row numbers. `showFileName` is off where the list belongs
 * to a single file that is already named.
 */
export function ProblemList({
  groups,
  showFileName = true,
}: {
  groups: ProblemGroup[];
  showFileName?: boolean;
}) {
  const { t, i18n } = useTranslation("common");
  const language = i18n.language;
  return (
    <ul className="grid gap-2">
      {groups.map(({ reason, count, files }) => (
        <li key={reason}>
          <span className="font-medium text-foreground">{t(`import.reasons.${reason}`)}</span> (
          {t("import.summary.rows", { count })})
          <ul className="text-xs">
            {files.map(({ id, fileName, rows }) => (
              <li key={id}>
                {showFileName && <span className="break-all">{fileName}: </span>}
                {t("import.summary.row")}{" "}
                {rows
                  .slice(0, MAX_LISTED_ROWS)
                  .map((row) => formatNumber(row, language))
                  .join(", ")}
                {rows.length > MAX_LISTED_ROWS &&
                  ` ${t("import.summary.moreRows", { count: rows.length - MAX_LISTED_ROWS })}`}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
