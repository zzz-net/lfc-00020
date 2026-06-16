import type { Ticket } from "../../shared/types";
import StatusBadge from "./StatusBadge";
import UrgencyBadge from "./UrgencyBadge";
import { useNavigate } from "react-router-dom";
import { CalendarDays, User2, Clock } from "lucide-react";

interface Props {
  ticket: Ticket;
}

export default function TicketCard({ ticket }: Props) {
  const navigate = useNavigate();
  const created = new Date(ticket.createdAt).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      onClick={() => navigate(`/tickets/${ticket.id}`)}
      className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="font-mono text-xs font-medium text-slate-500">{ticket.ticketNo}</span>
        <StatusBadge status={ticket.status} />
      </div>
      <h4 className="mb-1 line-clamp-2 text-sm font-semibold text-slate-800 group-hover:text-indigo-700">
        {ticket.title}
      </h4>
      <p className="mb-3 line-clamp-2 text-xs text-slate-500">{ticket.location}</p>
      <div className="mb-3 flex items-center gap-2">
        <UrgencyBadge urgency={ticket.urgency} />
      </div>
      <div className="flex flex-col gap-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          期望：{ticket.expectedDate}
        </div>
        {ticket.technicianName ? (
          <div className="flex items-center gap-1.5 text-indigo-600">
            <User2 className="h-3.5 w-3.5" />
            {ticket.technicianName}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-400">
            <User2 className="h-3.5 w-3.5" />
            未派单
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {created}
        </div>
      </div>
    </div>
  );
}
