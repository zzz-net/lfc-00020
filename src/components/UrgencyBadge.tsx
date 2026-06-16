import { URGENCY_LABELS, type Urgency } from '@shared/types';

const urgencyStyles: Record<Urgency, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export default function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${urgencyStyles[urgency]}`}
    >
      {URGENCY_LABELS[urgency]}
    </span>
  );
}
