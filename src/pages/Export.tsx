import { useEffect, useState } from "react";
import type { Technician, Ticket } from "../../shared/types";
import { STATUS_LABELS } from "../../shared/types";
import { useAppStore } from "@/store";
import { FileDown, Calendar, Users } from "lucide-react";

export default function ExportCenter() {
  const [techs, setTechs] = useState<Technician[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filters, setFilters] = useState({ startDate: "", endDate: "", technicianId: "" as string | number });
  const { showToast } = useAppStore();

  useEffect(() => {
    Promise.all([fetch("/api/technicians"), fetch("/api/tickets")]).then(async ([r1, r2]) => {
      const j1 = await r1.json();
      const j2 = await r2.json();
      setTechs(j1.data ?? []);
      setTickets(j2.data ?? []);
    });
  }, []);

  const filtered = tickets.filter((t) => {
    if (filters.startDate && t.createdAt.slice(0, 10) < filters.startDate) return false;
    if (filters.endDate && t.createdAt.slice(0, 10) > filters.endDate) return false;
    if (filters.technicianId && t.technicianId !== Number(filters.technicianId)) return false;
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

  const doExport = async () => {
    try {
      let url = "/api/export/csv";
      const qs: string[] = [];
      if (filters.startDate) qs.push(`start=${encodeURIComponent(filters.startDate)}`);
      if (filters.endDate) qs.push(`end=${encodeURIComponent(filters.endDate)}`);
      if (filters.technicianId) qs.push(`technician=${filters.technicianId}`);
      if (qs.length) url += "?" + qs.join("&");
      const res = await fetch(url);
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(u);
      showToast("CSV 导出成功", "success");
    } catch {
      showToast("导出失败", "error");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <FileDown className="h-4 w-4" />
          筛选条件
        </h3>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-slate-600">
              <Calendar className="h-3 w-3" /> 开始日期
            </label>
            <input type="date" value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-slate-600">
              <Calendar className="h-3 w-3" /> 结束日期
            </label>
            <input type="date" value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-slate-600">
              <Users className="h-3 w-3" /> 技师
            </label>
            <select value={filters.technicianId}
              onChange={(e) => setFilters({ ...filters, technicianId: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <option value="">全部</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={doExport}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              <FileDown className="h-4 w-4" /> 导出 CSV
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-5 gap-4">
        <StatCard label="筛选后总数" value={stats.total} />
        {Object.entries(stats.byStatus).map(([k, v]) => (
          <StatCard key={k} label={STATUS_LABELS[k as keyof typeof STATUS_LABELS]} value={v} />
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
          预览（前 50 条）
        </div>
        <div className="max-h-[500px] overflow-auto">
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
              {filtered.slice(0, 50).map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2 font-mono text-slate-600">{t.ticketNo}</td>
                  <td className="px-4 py-2 text-slate-800 max-w-xs truncate">{t.title}</td>
                  <td className="px-4 py-2">{STATUS_LABELS[t.status]}</td>
                  <td className="px-4 py-2 text-slate-600">{t.technicianName ?? "未派单"}</td>
                  <td className="px-4 py-2 text-slate-600">{t.expectedDate}</td>
                  <td className="px-4 py-2 text-slate-500">{new Date(t.createdAt).toLocaleDateString("zh-CN")}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400">暂无数据</td></tr>
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
