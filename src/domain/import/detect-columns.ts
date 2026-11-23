import {
  FIELD_ALIASES,
  FIELD_IDS,
  REQUIRED_FIELDS,
  type ColumnMapping,
  type Detection,
  type FieldId,
} from "./fields";

/** Largest accepted normalised Levenshtein distance for a non-exact match. */
const MAX_DISTANCE = 0.25;

/** Lower-case, strip diacritics and everything that is not a letter or digit. */
export function normalizeHeader(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** 0 for an exact match, otherwise the normalised distance; null if not similar enough. */
function distance(header: string, alias: string): number | null {
  if (header === "" || alias === "") return null;
  if (header === alias) return 0;
  const d = levenshtein(header, alias) / Math.max(header.length, alias.length);
  return d <= MAX_DISTANCE ? d : null;
}

const NORMALIZED_ALIASES = Object.fromEntries(
  FIELD_IDS.map((id) => [id, FIELD_ALIASES[id].map(normalizeHeader)]),
) as Record<FieldId, string[]>;

/**
 * Assigns columns to fields: exact alias matches first, then similar ones. A column serves one
 * field only; a field is ambiguous if several still free columns match it equally well.
 */
export function detectColumns(headers: string[]): Detection {
  const normalized = headers.map(normalizeHeader);
  const candidates = new Map<FieldId, { column: number; distance: number }[]>();
  for (const id of FIELD_IDS) {
    const list: { column: number; distance: number }[] = [];
    normalized.forEach((header, column) => {
      const distances = NORMALIZED_ALIASES[id]
        .map((alias) => distance(header, alias))
        .filter((d): d is number => d !== null);
      if (distances.length > 0) list.push({ column, distance: Math.min(...distances) });
    });
    candidates.set(id, list);
  }

  const mapping: ColumnMapping = {};
  const ambiguous: FieldId[] = [];
  const claimed = new Set<number>();
  const undecided = new Set<FieldId>(FIELD_IDS);

  for (;;) {
    let best: { id: FieldId; distance: number; columns: number[] } | null = null;
    for (const id of FIELD_IDS) {
      if (!undecided.has(id)) continue;
      const free = (candidates.get(id) ?? []).filter((c) => !claimed.has(c.column));
      if (free.length === 0) continue;
      const min = Math.min(...free.map((c) => c.distance));
      if (best === null || min < best.distance) {
        best = {
          id,
          distance: min,
          columns: free.filter((c) => c.distance === min).map((c) => c.column),
        };
      }
    }
    if (best === null) break;
    undecided.delete(best.id);
    const [only] = best.columns;
    if (best.columns.length === 1 && only !== undefined) {
      mapping[best.id] = only;
      claimed.add(only);
    } else {
      ambiguous.push(best.id);
    }
  }

  const missing = REQUIRED_FIELDS.filter(
    (id) => mapping[id] === undefined && !ambiguous.includes(id),
  );
  return { mapping, missing, ambiguous };
}
