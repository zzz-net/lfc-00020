import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Ticket, TicketStatus } from "../../shared/types";
import { STATUS_LABELS } from "../../shared/types";
import TicketCard from "@/components/TicketCard";
import StatusBadge from "@/components/StatusBadge";
import { Plus, FileDown, ListFilter } from "lucide-react";
import { useAppStore } from "@/store";

const COLUMNS: TicketStatus[] = ["pending_assign", "in_progress", "pending_verify", "closed"];

export default function Dashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { showToast } = useAppStore();

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tickets");
      const json = await res.json();
      setTickets(json.data ?? []);
    } catch {
      showToast("加载工单列表失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const g: Record<TicketStatus, Ticket[]> = {
      pending_assign: [],
      in_progress: [],
      pending_verify: [],
      closed: [],
    };
    for (const t of tickets) g[t.status].push(t);
    return g;
  }, [tickets]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: tickets.length,
      pending: grouped.pending_assign.length,
      inProgress: grouped.in_progress.length,
      closedToday: grouped.closed.filter((t) => t.updatedAt.slice(0, 10) === today).length,
      assignedToday: tickets.filter((t) => t.assignedAt?.slice(0, 10) === today).length,
    };
  }, [tickets, grouped]);

  const exportCsv = async () => {
    try {
      const res = await fetch("/api/export/csv");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("CSV 导出成功", "success");
    } catch {
      showToast("导出失败", "error");
    }
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">加载中…</div>;

  return (
    <div className="space-y-6">
      {/* Top actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/tickets/new")}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            新建工单
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700"
          >
            <FileDown className="h-4 w-4" />
            导出 CSV
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300"
          >
            <ListFilter className="h-4 w-4" />
            刷新
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard label="工单总数" value={stats.total} color="slate" />
        <StatCard label="待派单" value={stats.pending} color="slate" />
        <StatCard label="处理中" value={stats.inProgress} color="blue" />
        <StatCard label="今日派单" value={stats.assignedToday} color="violet" />
        <StatCard label="今日关闭" value={stats.closedToday} color="emerald" />
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-4 gap-4">
        {COLUMNS.map((col) => (
          <div
            key={col}
            className="flex min-h-[400px] flex-col rounded-xl border border-slate-200 bg-slate-50/70"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <StatusBadge status={col} size="md" />
                <span className="text-xs font-medium text-slate-500">{STATUS_LABELS[col]}</span>
              </div>
              <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {grouped[col].length}
              </span>
            </div>
            <div className="flex-1 space-y-3 p-3">
              {grouped[col].length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">暂无工单</div>
              ) : (
                grouped[col].map((t) => <TicketCard key={t.id} ticket={t} />)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "slate" | "blue" | "violet" | "emerald";
}) {
  const c = {
    slate: "from-slate-50 to-white border-slate-200 text-slate-700",
    blue: "from-blue-50 to-white border-blue-200 text-blue-700",
    violet: "from-violet-50 to-white border-violet-200 text-violet-700",
    emerald: "from-emerald-50 to-white border-emerald-200 text-emerald-700",
  }[color];
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${c} px-5 py-4 shadow-sm`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
