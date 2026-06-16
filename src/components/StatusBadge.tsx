import type { TicketStatus } from "../../shared/types";
import { STATUS_LABELS } from "../../shared/types";
import { cn } from "@/lib/utils";

const COLORS: Record<TicketStatus, string> = {
  pending_assign: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  pending_verify: "bg-amber-100 text-amber-700 border-amber-200",
  closed: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const DOT: Record<TicketStatus, string> = {
  pending_assign: "bg-slate-500",
  in_progress: "bg-blue-500",
  pending_verify: "bg-amber-500",
  closed: "bg-emerald-500",
};

interface Props {
  status: TicketStatus;
  size?: "sm" | "md";
}

export default function StatusBadge({ status, size = "sm" }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium",
        COLORS[status],
        size === "sm" ? "text-xs" : "text-sm"
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", DOT[status])} />
      {STATUS_LABELS[status]}
    </span>
  );
}
