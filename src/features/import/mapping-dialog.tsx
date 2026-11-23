import { useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import {
  FIELD_IDS,
  REQUIRED_FIELDS,
  type ColumnMapping,
  type FieldId,
} from "@/domain/import/fields";
import {
  cancelMappingAtom,
  confirmMappingAtom,
  pendingMappingsAtom,
  type PendingMapping,
} from "@/state/atoms";

const OPTIONAL_FIELDS = FIELD_IDS.filter((id) => !REQUIRED_FIELDS.includes(id));
const PREVIEW_ROWS = 5;

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? "" : cell.toISOString().slice(0, 16).replace("T", " ");
  }
  return typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean"
    ? String(cell)
    : "";
}

/** Fields that share a column with another field. */
function duplicatedFields(mapping: ColumnMapping): FieldId[] {
  const entries = Object.entries(mapping) as [FieldId, number][];
  return entries
    .filter(([id, column]) => entries.some(([other, c]) => other !== id && c === column))
    .map(([id]) => id);
}

function MappingForm({ pending }: { pending: PendingMapping }) {
  const { t } = useTranslation("common");
  const confirm = useSetAtom(confirmMappingAtom);
  const cancel = useSetAtom(cancelMappingAtom);
  const { table, detection } = pending;
  const [mapping, setMapping] = useState<ColumnMapping>(detection.mapping);

  // Fields that still need an answer come first; the order is fixed when the form opens.
  const [requiredOrder] = useState(() => [
    ...REQUIRED_FIELDS.filter((id) => detection.mapping[id] === undefined),
    ...REQUIRED_FIELDS.filter((id) => detection.mapping[id] !== undefined),
  ]);
  const duplicated = duplicatedFields(mapping);
  const complete = REQUIRED_FIELDS.every((id) => mapping[id] !== undefined);
  const valid = complete && duplicated.length === 0;

  const columnName = (header: string, column: number) =>
    header.trim() === "" ? t("import.mapping.column", { n: column + 1 }) : header;

  const select = (id: FieldId) => {
    const value = mapping[id];
    const required = REQUIRED_FIELDS.includes(id);
    const ambiguous = detection.ambiguous.includes(id) && value === undefined;
    const duplicate = duplicated.includes(id);
    const missing = required && value === undefined;
    const invalid = duplicate || missing;
    const selectId = `mapping-${id}`;
    return (
      <div key={id} className="grid gap-1.5">
        <label htmlFor={selectId} className="text-sm font-medium">
          {t(`import.fields.${id}`)}
        </label>
        <NativeSelect
          id={selectId}
          value={value === undefined ? "" : String(value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${selectId}-note` : undefined}
          onChange={(event) => {
            const next = { ...mapping };
            if (event.target.value === "") delete next[id];
            else next[id] = Number(event.target.value);
            setMapping(next);
          }}
        >
          <option value="">
            {REQUIRED_FIELDS.includes(id)
              ? t("import.mapping.placeholder")
              : t("import.mapping.none")}
          </option>
          {table.headers.map((header, column) => (
            <option key={column} value={column}>
              {columnName(header, column)}
            </option>
          ))}
        </NativeSelect>
        {invalid && (
          <p id={`${selectId}-note`} className="text-xs text-destructive">
            {duplicate
              ? t("import.mapping.duplicate")
              : ambiguous
                ? t("import.mapping.ambiguous")
                : t("import.mapping.pick")}
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("import.mapping.title")}</DialogTitle>
        <DialogDescription>
          {t("import.mapping.description", { file: table.fileName })}
        </DialogDescription>
      </DialogHeader>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">{t("import.mapping.required")}</legend>
        {requiredOrder.map(select)}
      </fieldset>

      <Collapsible className="grid gap-3">
        <CollapsibleTrigger className="group flex w-fit items-center gap-1 rounded-md text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <ChevronRight
            className="size-4 transition-transform group-data-[state=open]:rotate-90"
            aria-hidden="true"
          />
          {t("import.mapping.optional")}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid gap-4 sm:grid-cols-2">{OPTIONAL_FIELDS.map(select)}</div>
        </CollapsibleContent>
      </Collapsible>

      <div className="grid gap-2">
        <h3 className="text-sm font-medium">{t("import.mapping.preview")}</h3>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-max min-w-full text-left text-xs">
            <thead className="bg-muted">
              <tr>
                {table.headers.map((header, column) => (
                  <th
                    key={column}
                    scope="col"
                    className="px-2 py-1.5 font-medium whitespace-nowrap"
                  >
                    {columnName(header, column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                <tr key={index} className="border-t">
                  {table.headers.map((_, column) => (
                    <td
                      key={column}
                      className="px-2 py-1.5 whitespace-nowrap text-muted-foreground"
                    >
                      {cellText(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => cancel()}>
          {t("import.mapping.cancel")}
        </Button>
        <Button disabled={!valid} onClick={() => confirm(mapping)}>
          {t("import.mapping.confirm")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Works off the pending files one at a time; closing the dialog skips the file. */
export function MappingDialog() {
  const { t } = useTranslation("common");
  const pending = useAtomValue(pendingMappingsAtom)[0];
  const cancel = useSetAtom(cancelMappingAtom);
  return (
    <Dialog open={pending !== undefined} onOpenChange={(open) => !open && cancel()}>
      {pending && (
        <DialogContent closeLabel={t("import.mapping.close")} className="sm:max-w-2xl">
          <MappingForm key={pending.id} pending={pending} />
        </DialogContent>
      )}
    </Dialog>
  );
}
