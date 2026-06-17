import { useEffect, useState } from "react";
import type { ExportBatch, ExportBatchStatus, Technician, Ticket } from "../../shared/types";
import {
  EXPORT_BATCH_STATUS_COLORS,
  EXPORT_BATCH_STATUS_LABELS,
  STATUS_LABELS,
  VERIFICATION_STATUS_COLORS,
  VERIFICATION_STATUS_LABELS,
} from "../../shared/types";
import type { VerificationStatus } from "../../shared/types";
import { useAppStore } from "@/store";
import {
  FileDown,
  Calendar,
  Users,
  Filter,
  Plus,
  RefreshCw,
  Download,
  XCircle,
  RotateCcw,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  XOctagon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";

export default function ExportCenter() {
  const [techs, setTechs] = useState<Technician[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [batches, setBatches] = useState<ExportBatch[]>([]);
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    technicianId: "" as string | number,
    status: "" as string,
  });
  const [isCreating, setIsCreating] = useState(false);
  const { currentOperator, showToast } = useAppStore();
  const navigate = useNavigate();

  const loadBatches = async () => {
    try {
      const res = await fetch(`/api/export/batches?operator=${encodeURIComponent(currentOperator)}`);
      const json = await res.json();
      setBatches(json.data ?? []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/technicians"),
      fetch("/api/tickets"),
    ]).then(async ([r1, r2]) => {
      const j1 = await r1.json();
      const j2 = await r2.json();
      setTechs(j1.data ?? []);
      setTickets(j2.data ?? []);
    });
    loadBatches();
    const timer = setInterval(loadBatches, 3000);
    return () => clearInterval(timer);
  }, [currentOperator]);

  const filtered = tickets.filter((t) => {
    if (filters.startDate && t.createdAt.slice(0, 10) < filters.startDate) return false;
    if (filters.endDate && t.createdAt.slice(0, 10) > filters.endDate) return false;
    if (filters.technicianId && t.technicianId !== Number(filters.technicianId)) return false;
    if (filters.status && t.status !== filters.status) return false;
    return true;
  });

  const stats = {
    total: filtered.length,
    byStatus: filtered.reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    }, {}),
    byTech: filtered.reduce<Record<string, number>>((acc, t) => {
      const k = t.technicianName ?? "未派单";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
  };

  const createBatch = async () => {
    setIsCreating(true);
    try {
      const body: any = { operator: currentOperator };
      if (filters.startDate) body.startDate = filters.startDate;
      if (filters.endDate) body.endDate = filters.endDate;
      if (filters.technicianId) body.technicianId = Number(filters.technicianId);
      if (filters.status) body.status = filters.status;

      const res = await fetch("/api/export/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "创建失败");
      showToast(`导出批次 ${json.data.batchNo} 已创建`, "success");
      await loadBatches();
    } catch (e: any) {
      showToast(e.message ?? "创建失败", "error");
    } finally {
      setIsCreating(false);
    }
  };

  const cancelBatch = async (id: number) => {
    if (!confirm("确认取消此导出批次？")) return;
    try {
      const res = await fetch(`/api/export/batches/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator: currentOperator }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "取消失败");
      showToast("已取消", "success");
      await loadBatches();
    } catch (e: any) {
      showToast(e.message ?? "取消失败", "error");
    }
  };

  const retryBatch = async (id: number) => {
    try {
      const res = await fetch(`/api/export/batches/${id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator: currentOperator }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "重试失败");
      showToast(`已重新创建批次 ${json.data.batchNo}`, "success");
      await loadBatches();
    } catch (e: any) {
      showToast(e.message ?? "重试失败", "error");
    }
  };

  const downloadBatch = async (batch: ExportBatch) => {
    try {
      const url = `/api/export/batches/${batch.id}/download?operator=${encodeURIComponent(currentOperator)}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = batch.fileName ?? `export-${batch.batchNo}.csv`;
      a.click();
      showToast("开始下载", "success");
    } catch {
      showToast("下载失败", "error");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Filter className="h-4 w-4" />
            筛选条件
          </h3>
          <button
            onClick={loadBatches}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
          >
            <RefreshCw className="h-3 w-3" /> 刷新批次列表
          </button>
        </div>
        <div className="grid grid-cols-5 gap-4">
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-slate-600">
              <Calendar className="h-3 w-3" /> 开始日期
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-slate-600">
              <Calendar className="h-3 w-3" /> 结束日期
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-slate-600">
              <Users className="h-3 w-3" /> 技师
            </label>
            <select
              value={filters.technicianId}
              onChange={(e) => setFilters({ ...filters, technicianId: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <option value="">全部</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-slate-600">
              <Filter className="h-3 w-3" /> 工单状态
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <option value="">全部</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={createBatch}
              disabled={isCreating}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isCreating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              创建导出批次
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-5 gap-4">
        <StatCard label="当前筛选命中" value={stats.total} />
        {Object.entries(stats.byStatus).map(([k, v]) => (
          <StatCard
            key={k}
            label={STATUS_LABELS[k as keyof typeof STATUS_LABELS]}
            value={v}
          />
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <FileDown className="h-3 w-3" /> 导出批次历史
          </div>
          <span className="text-xs text-slate-400">共 {batches.length} 条</span>
        </div>
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white text-slate-500 shadow-sm z-10">
              <tr>
                <th className="px-4 py-2 text-left">批次号</th>
                <th className="px-4 py-2 text-left">筛选条件</th>
                <th className="px-4 py-2 text-left">状态</th>
                <th className="px-4 py-2 text-left">验真</th>
                <th className="px-4 py-2 text-left">总数/已导出</th>
                <th className="px-4 py-2 text-left">创建人</th>
                <th className="px-4 py-2 text-left">创建时间</th>
                <th className="px-4 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2 font-mono text-slate-700">{b.batchNo}</td>
                  <td className="px-4 py-2 text-slate-600 max-w-xs truncate" title={b.filterSummary}>
                    {b.filterSummary}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="px-4 py-2">
                    {b.status === "completed" && b.verificationStatus ? (
                      <VerificationBadge status={b.verificationStatus as VerificationStatus} />
                    ) : (
                      <span className="text-[11px] text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {b.totalCount} / {b.exportedCount}
                    {b.failedReason && (
                      <div className="text-red-500 text-[10px] mt-0.5 truncate max-w-[150px]" title={b.failedReason}>
                        {b.failedReason}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{b.operator}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {new Date(b.createdAt).toLocaleString("zh-CN")}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate(`/export/batches/${b.id}`)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                        title="查看详情"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {b.status === "completed" && (
                        <button
                          onClick={() => downloadBatch(b)}
                          className="p-1 rounded hover:bg-slate-100 text-emerald-600 hover:text-emerald-700"
                          title="下载"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {b.status === "pending" && (
                        <button
                          onClick={() => cancelBatch(b.id)}
                          className="p-1 rounded hover:bg-red-50 text-red-500 hover:text-red-600"
                          title="取消"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {(b.status === "failed" || b.status === "cancelled") && (
                        <button
                          onClick={() => retryBatch(b.id)}
                          className="p-1 rounded hover:bg-amber-50 text-amber-600 hover:text-amber-700"
                          title="重试"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    暂无导出批次
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
          当前筛选预览（前 30 条）
        </div>
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white text-slate-500 shadow-sm">
              <tr>
                <th className="px-4 py-2 text-left">工单编号</th>
                <th className="px-4 py-2 text-left">标题</th>
                <th className="px-4 py-2 text-left">状态</th>
                <th className="px-4 py-2 text-left">技师</th>
                <th className="px-4 py-2 text-left">期望日期</th>
                <th className="px-4 py-2 text-left">创建时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, 30).map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2 font-mono text-slate-600">{t.ticketNo}</td>
                  <td className="px-4 py-2 text-slate-800 max-w-xs truncate">{t.title}</td>
                  <td className="px-4 py-2">{STATUS_LABELS[t.status]}</td>
                  <td className="px-4 py-2 text-slate-600">{t.technicianName ?? "未派单"}</td>
                  <td className="px-4 py-2 text-slate-600">{t.expectedDate}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {new Date(t.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-5 py-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-800">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ExportBatchStatus }) {
  const label = EXPORT_BATCH_STATUS_LABELS[status];
  const color = EXPORT_BATCH_STATUS_COLORS[status];
  const icons: Record<string, any> = {
    pending: Clock,
    processing: RefreshCw,
    completed: CheckCircle2,
    failed: AlertCircle,
    cancelled: XOctagon,
  };
  const Icon = icons[status] ?? Clock;
  const colorMap: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        colorMap[color] ?? "bg-slate-100 text-slate-700"
      )}
    >
      <Icon className={clsx("h-3 w-3", status === "processing" && "animate-spin")} />
      {label}
    </span>
  );
}

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const label = VERIFICATION_STATUS_LABELS[status];
  const color = VERIFICATION_STATUS_COLORS[status];
  const icons: Record<string, any> = {
    pending: Clock,
    verified: CheckCircle2,
    mismatch: AlertCircle,
  };
  const Icon = icons[status] ?? Clock;
  const colorMap: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        colorMap[color] ?? "bg-slate-100 text-slate-700"
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
