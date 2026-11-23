/** True for a cell without content: missing, null or only whitespace. */
export const isBlankCell = (cell: unknown): boolean =>
  cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");

/**
 * The text of a raw cell as read from CSV or XLSX. Date cells carry the wall clock in their UTC
 * fields and are written as "YYYY-MM-DD HH:MM"; anything that is not a plain value is "".
 */
export function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? "" : cell.toISOString().slice(0, 16).replace("T", " ");
  }
  return typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean"
    ? String(cell)
    : "";
}
