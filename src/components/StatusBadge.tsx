import { STATUS_LABELS, type TicketStatus } from '@shared/types';

const statusStyles: Record<TicketStatus, string> = {
  pending_assign: 'bg-amber-100 text-amber-800 border-amber-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  pending_verify: 'bg-purple-100 text-purple-800 border-purple-200',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusStyles[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
