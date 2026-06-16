import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { Ticket, TicketStatus } from '@shared/types';
import { STATUS_LABELS } from '@shared/types';
import TicketCard from '@/components/TicketCard';
import { useAppStore } from '@/store/useAppStore';
import { FileText, Wrench, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

const STATUSES: { key: TicketStatus; label: string; icon: typeof FileText }[] = [
  { key: 'pending_assign', label: STATUS_LABELS.pending_assign, icon: Clock },
  { key: 'in_progress', label: STATUS_LABELS.in_progress, icon: Wrench },
  { key: 'pending_verify', label: STATUS_LABELS.pending_verify, icon: AlertTriangle },
  { key: 'closed', label: STATUS_LABELS.closed, icon: CheckCircle2 },
];

const columnColors: Record<TicketStatus, string> = {
  pending_assign: 'border-amber-300 bg-amber-50/30',
  in_progress: 'border-blue-300 bg-blue-50/30',
  pending_verify: 'border-purple-300 bg-purple-50/30',
  closed: 'border-slate-300 bg-slate-50/30',
};

export default function Dashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const { reloadKey } = useAppStore();

  useEffect(() => {
    setLoading(true);
    api.tickets
      .list()
      .then(setTickets)
      .catch((err) => alert(err.message))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const grouped: Record<TicketStatus, Ticket[]> = {
    pending_assign: [],
    in_progress: [],
    pending_verify: [],
    closed: [],
  };
  tickets.forEach((t) => {
    grouped[t.status].push(t);
  });

  const stats = {
    total: tickets.length,
    pending: grouped.pending_assign.length,
    inProgress: grouped.in_progress.length,
    closed: grouped.closed.length,
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-1">工单看板</h2>
        <p className="text-sm text-slate-500">查看并管理所有维修工单的进度</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">全部工单</div>
          <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-amber-200 shadow-sm">
          <div className="text-sm text-amber-600 mb-1">待派单</div>
          <div className="text-2xl font-bold text-amber-700">{stats.pending}</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm">
          <div className="text-sm text-blue-600 mb-1">处理中</div>
          <div className="text-2xl font-bold text-blue-700">{stats.inProgress}</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">已关闭</div>
          <div className="text-2xl font-bold text-slate-700">{stats.closed}</div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500">加载中...</div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {STATUSES.map(({ key, label, icon: Icon }) => (
            <div key={key} className={`rounded-lg border-t-4 ${columnColors[key]} bg-white/50`}>
              <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-slate-600" />
                  <h3 className="font-semibold text-sm text-slate-700">{label}</h3>
                </div>
                <span className="text-xs font-medium bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                  {grouped[key].length}
                </span>
              </div>
              <div className="p-3 space-y-2 min-h-[300px] max-h-[calc(100vh-320px)] overflow-y-auto">
                {grouped[key].length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">暂无工单</div>
                ) : (
                  grouped[key].map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
