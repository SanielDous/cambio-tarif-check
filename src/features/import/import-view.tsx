import { Lock, Table2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PRICE_DATA, parseIsoDate } from "@/domain/pricing/price-data";
import { formatDate } from "@/lib/format";
import { Dropzone } from "./dropzone";
import { FileMessages } from "./file-messages";
import { MappingDialog } from "./mapping-dialog";

/** The first screen: where to get the export, what happens to the data, and the drop zone. */
export function ImportView() {
  const { t, i18n } = useTranslation("common");
  return (
    <div className="space-y-6">
      <Dropzone />
      <FileMessages />
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="flex gap-3">
          <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-sm font-medium">{t("import.privacy.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("import.privacy.text")}</p>
          </div>
        </section>
        <section className="flex gap-3">
          <Table2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-sm font-medium">{t("import.where.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("import.where.text")}</p>
          </div>
        </section>
      </div>
      <p className="text-sm text-muted-foreground">{t("import.completeness")}</p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-4 text-sm text-muted-foreground">
        <span>{t("import.notice.unofficial")}</span>
        <span aria-hidden="true">·</span>
        <span>
          {t("import.notice.pricesAsOf", {
            date: formatDate(parseIsoDate(PRICE_DATA.pricesAsOf), i18n.language),
          })}
        </span>
        <span aria-hidden="true">·</span>
        <a className="underline underline-offset-4" href="#/how-it-works">
          {t("import.notice.more")}
        </a>
      </p>
      <MappingDialog />
    </div>
  );
}
