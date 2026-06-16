import { Link } from 'react-router-dom';
import type { Ticket } from '@shared/types';
import StatusBadge from './StatusBadge';
import UrgencyBadge from './UrgencyBadge';
import { Calendar, MapPin, User } from 'lucide-react';

export default function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className="block bg-white rounded-lg border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-200 group"
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-mono text-slate-500">{ticket.ticketNo}</span>
        <StatusBadge status={ticket.status} />
      </div>
      <h3 className="font-semibold text-slate-900 text-sm mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">
        {ticket.title}
      </h3>
      <div className="flex items-center gap-2 mb-2">
        <UrgencyBadge urgency={ticket.urgency} />
      </div>
      <div className="space-y-1 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          <span className="truncate">{ticket.location}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5" />
          <span className="truncate">
            {ticket.technicianName || '未指派'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          <span>{ticket.expectedDate}</span>
        </div>
      </div>
    </Link>
  );
}
