import {
  AlarmClock,
  Ban,
  CalendarX2,
  CircleCheck,
  CircleHelp,
  PenLine,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { ReconstructionKind } from "@/domain/analysis/reconstruct-booking";
import { cn } from "@/lib/utils";
import { Hint } from "./hint";

const ICONS: Record<ReconstructionKind, LucideIcon> = {
  verified: CircleCheck,
  "verified-rounding": CircleCheck,
  estimated: CircleHelp,
  manual: PenLine,
  cancelled: CalendarX2,
  unused: Ban,
  overrun: AlarmClock,
  "not-reproducible": TriangleAlert,
};

/**
 * How a trip was recomputed, with a plain-language explanation on hover, focus or tap. A late
 * return names its overrun minutes.
 */
export function StatusBadge({
  kind,
  overrunMinutes = 0,
}: {
  kind: ReconstructionKind;
  overrunMinutes?: number;
}) {
  const { t } = useTranslation("common");
  const Icon = ICONS[kind];
  const open = kind === "estimated" || kind === "not-reproducible";
  const text =
    kind === "overrun"
      ? t("result.kinds.overrun.text", { count: overrunMinutes })
      : t(`result.kinds.${kind}.text`);
  return (
    <Hint content={text}>
      <Badge
        asChild
        variant={open ? "outline" : "secondary"}
        className={cn(
          "cursor-help outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          open && "border-foreground/40 border-dashed",
        )}
      >
        <button type="button" data-testid="status-badge" data-kind={kind}>
          <Icon
            aria-hidden="true"
            className={cn((kind === "verified" || kind === "verified-rounding") && "text-best")}
          />
          {t(`result.kinds.${kind}.label`)}
        </button>
      </Badge>
    </Hint>
  );
}
