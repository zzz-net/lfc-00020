import type { Urgency } from "../../shared/types";
import { URGENCY_LABELS } from "../../shared/types";
import { cn } from "@/lib/utils";

const COLORS: Record<Urgency, string> = {
  low: "bg-slate-100 text-slate-600 border-slate-200",
  medium: "bg-sky-100 text-sky-700 border-sky-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200 ring-1 ring-red-300",
};

export default function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        COLORS[urgency]
      )}
    >
      {URGENCY_LABELS[urgency]}
    </span>
  );
}
