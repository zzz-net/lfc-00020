import { useEffect, useState } from "react";
import type { AuditLog as AuditLogT } from "../../shared/types";
import { useNavigate } from "react-router-dom";
import { Search, ArrowUpDown } from "lucide-react";

const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
  create: { label: "创建", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  assign: { label: "派单", cls: "bg-violet-100 text-violet-700 border-violet-200" },
  status_change: { label: "状态变更", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  undo: { label: "撤销", cls: "bg-orange-100 text-orange-700 border-orange-200 ring-1 ring-orange-200" },
  note_add: { label: "备注", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  technician_create: { label: "新增技师", cls: "bg-sky-100 text-sky-700 border-sky-200" },
  technician_update: { label: "更新技师", cls: "bg-sky-100 text-sky-700 border-sky-200" },
  technician_delete: { label: "删除技师", cls: "bg-red-100 text-red-700 border-red-200" },
  vacation_create: { label: "休假设置", cls: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  export_create: { label: "导出创建", cls: "bg-teal-100 text-teal-700 border-teal-200" },
  export_cancel: { label: "导出取消", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  export_retry: { label: "导出重试", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  export_complete: { label: "导出完成", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  export_fail: { label: "导出失败", cls: "bg-red-100 text-red-700 border-red-200" },
  export_recover: { label: "导出恢复", cls: "bg-cyan-100 text-cyan-700 border-cyan-200" },
};

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLogT[]>([]);
  const [kw, setKw] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/audit");
        const j = await res.json();
        setLogs(j.data ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const actions = Array.from(new Set(logs.map((l) => l.action)));

  const filtered = logs
    .filter((l) => {
      if (actionFilter && l.action !== actionFilter) return false;
      if (!kw.trim()) return true;
      const q = kw.toLowerCase();
      return (
        l.description.toLowerCase().includes(q) ||
        l.operator.toLowerCase().includes(q) ||
        String(l.ticketId ?? "").includes(q)
      );
    })
    .sort((a, b) => b.id - a.id);

  if (loading) return <div className="p-8 text-sm text-slate-500">加载中…</div>;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="搜索操作描述 / 操作人 / 工单ID..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:bg-white focus:outline-none"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
          >
            <option value="">全部操作</option>
            {actions.map((a) => (
              <option key={a} value={a}>{ACTION_LABEL[a]?.label ?? a}</option>
            ))}
          </select>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 border border-slate-200">
            <ArrowUpDown className="mr-1 inline h-3 w-3" />
            共 {filtered.length} / {logs.length} 条
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600 shadow-sm z-10">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">时间</th>
                <th className="px-4 py-3 text-left">类型</th>
                <th className="px-4 py-3 text-left">工单</th>
                <th className="px-4 py-3 text-left">操作人</th>
                <th className="px-4 py-3 text-left">操作描述</th>
                <th className="px-4 py-3 text-left">关联</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((l) => {
                const cfg = ACTION_LABEL[l.action] ?? { label: l.action, cls: "bg-slate-100 text-slate-700" };
                return (
                  <tr key={l.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">#{l.id}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString("zh-CN")}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {l.ticketId ? (
                        <button
                          onClick={() => navigate(`/tickets/${l.ticketId}`)}
                          className="font-mono text-xs text-blue-600 hover:underline"
                        >
                          #{l.ticketId}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-700">{l.operator}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-800 max-w-md">{l.description}</td>
                    <td className="px-4 py-2.5">
                      {l.undoOfId ? (
                        <span className="rounded bg-orange-50 px-2 py-0.5 text-[10px] text-orange-600 border border-orange-200">
                          撤销 #{l.undoOfId}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                    暂无记录
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
