import { useEffect, useMemo, useState, useRef } from "react";
import {
  Play,
  Square,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Copy,
  Server,
  Shield,
  User as UserIcon,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Upload,
  Download,
  Undo2,
  Repeat,
  Home,
  Activity,
  FileKey,
  X,
} from "lucide-react";
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";
import type {
  TakeoverPlan,
  TakeoverReceipt,
  TakeoverPlanScope,
  TakeoverAction,
  TakeoverReceiptStatus,
  CheckStatus,
  PortOccupierInfo,
  TakeoverPlanExport,
} from "../../shared/types";
import {
  TAKEOVER_RECEIPT_STATUS_LABELS,
  TAKEOVER_ACTION_LABELS,
  TAKEOVER_PLAN_SCOPE_LABELS,
  CHECK_STATUS_LABELS,
  TAKEOVER_RECEIPT_STATUS_COLORS,
} from "../../shared/types";

const API_BASE = "/api/takeover";

const DEV_USERS = [
  { username: "admin", role: "admin" as const, label: "管理员 (admin)" },
  { username: "devuser", role: "user" as const, label: "普通用户 (devuser)" },
];

function apiFetch<T = unknown>(
  path: string,
  username: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-username": username,
    ...(options.headers as Record<string, string>),
  };
  return fetch(`${API_BASE}${path}`, { ...options, headers }).then((r) => r.json() as Promise<T>);
}

function StatusBadge({ status }: { status: TakeoverReceiptStatus }) {
  const colorMap: Record<string, string> = {
    pending: "bg-slate-100 text-slate-700",
    running: "bg-amber-100 text-amber-700",
    success: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        colorMap[status]
      )}
    >
      {TAKEOVER_RECEIPT_STATUS_LABELS[status]}
    </span>
  );
}

function CheckBadge({ status }: { status: CheckStatus }) {
  const map: Record<string, string> = {
    pending: "bg-slate-100 text-slate-600",
    running: "bg-amber-100 text-amber-700",
    success: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
    skipped: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", map[status])}>
      {CHECK_STATUS_LABELS[status]}
    </span>
  );
}

function ActionBadge({ action }: { action: TakeoverAction }) {
  const map: Record<string, string> = {
    launch: "bg-blue-100 text-blue-700",
    reuse: "bg-violet-100 text-violet-700",
    stop: "bg-orange-100 text-orange-700",
  };
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", map[action])}>
      {TAKEOVER_ACTION_LABELS[action]}
    </span>
  );
}

export default function TakeoverReceiptCenter() {
  const { showToast } = useAppStore();
  const [activeUserIdx, setActiveUserIdx] = useState(0);
  const activeUser = DEV_USERS[activeUserIdx];
  const [plans, setPlans] = useState<TakeoverPlan[]>([]);
  const [receipts, setReceipts] = useState<TakeoverReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TakeoverPlan | null>(null);
  const [expandedReceiptId, setExpandedReceiptId] = useState<number | null>(null);
  const [executingPlanId, setExecutingPlanId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"plans" | "receipts">("plans");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    scope: "private" as TakeoverPlanScope,
    frontendCommand: "",
    backendCommand: "",
    expectedPort: 3088,
    homePageUrl: "http://localhost:5178/",
    apiHealthUrl: "http://localhost:3088/api/health",
    timeoutSec: 30,
  });
  const [portCheck, setPortCheck] = useState<PortOccupierInfo | null>(null);
  const [portChecking, setPortChecking] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [planRes, receiptRes] = await Promise.all([
        apiFetch<{ success: boolean; data: TakeoverPlan[] }>("/plans", activeUser.username),
        apiFetch<{ success: boolean; data: TakeoverReceipt[] }>("/receipts?limit=50", activeUser.username),
      ]);
      setPlans(planRes.data || []);
      setReceipts(receiptRes.data || []);
    } catch {
      showToast("加载接管中心数据失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [activeUser.username]);

  useEffect(() => {
    if (!form.expectedPort) return;
    let cancelled = false;
    setPortChecking(true);
    apiFetch<{ success: boolean; data: PortOccupierInfo }>(
      `/ports/${form.expectedPort}/check`,
      activeUser.username
    ).then((r) => {
      if (!cancelled) {
        setPortCheck(r.data || null);
        setPortChecking(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [form.expectedPort, activeUser.username]);

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      scope: activeUser.role === "admin" ? "public" : "private",
      frontendCommand: "",
      backendCommand: "npm run server:dev",
      expectedPort: 3088,
      homePageUrl: "http://localhost:5178/",
      apiHealthUrl: "http://localhost:3088/api/health",
      timeoutSec: 30,
    });
    setEditingPlan(null);
    setPortCheck(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (plan: TakeoverPlan) => {
    setForm({
      name: plan.name,
      description: plan.description || "",
      scope: plan.scope,
      frontendCommand: plan.frontendCommand || "",
      backendCommand: plan.backendCommand || "",
      expectedPort: plan.expectedPort,
      homePageUrl: plan.homePageUrl,
      apiHealthUrl: plan.apiHealthUrl,
      timeoutSec: plan.timeoutSec,
    });
    setEditingPlan(plan);
    setShowForm(true);
  };

  const openApplyLastSuccess = async () => {
    try {
      const res = await apiFetch<{ success: boolean; data: TakeoverPlan | null }>(
        "/plans/last-success",
        activeUser.username
      );
      if (!res.data) {
        showToast("暂无成功接管记录", "info");
        return;
      }
      const plan = res.data;
      setForm({
        name: `${plan.name} (副本)`,
        description: plan.description || "",
        scope: "private",
        frontendCommand: plan.frontendCommand || "",
        backendCommand: plan.backendCommand || "",
        expectedPort: plan.expectedPort,
        homePageUrl: plan.homePageUrl,
        apiHealthUrl: plan.apiHealthUrl,
        timeoutSec: plan.timeoutSec,
      });
      setEditingPlan(null);
      setShowForm(true);
      showToast("已套用上次成功方案", "success");
    } catch {
      showToast("获取上次成功方案失败", "error");
    }
  };

  const canModify = (plan: TakeoverPlan) => {
    if (activeUser.role === "admin") return true;
    if (plan.scope === "public") return false;
    return plan.ownerUsername === activeUser.username;
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      showToast("请输入方案名称", "error");
      return;
    }
    if (!form.backendCommand?.trim() && !form.frontendCommand?.trim()) {
      showToast("前端命令和后端命令至少填写一个", "error");
      return;
    }
    if (form.scope === "public" && activeUser.role !== "admin") {
      showToast("仅管理员可创建公共方案", "error");
      return;
    }
    try {
      if (editingPlan) {
        await apiFetch(`/plans/${editingPlan.id}`, activeUser.username, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        showToast("方案已更新", "success");
      } else {
        await apiFetch("/plans", activeUser.username, {
          method: "POST",
          body: JSON.stringify(form),
        });
        showToast("方案已创建", "success");
      }
      setShowForm(false);
      loadAll();
    } catch {
      showToast("保存方案失败", "error");
    }
  };

  const handleDelete = async (plan: TakeoverPlan) => {
    if (!confirm(`确定删除方案 "${plan.name}" 吗？`)) return;
    try {
      await apiFetch(`/plans/${plan.id}`, activeUser.username, { method: "DELETE" });
      showToast("方案已删除", "success");
      loadAll();
    } catch {
      showToast("删除失败", "error");
    }
  };

  const handleExecute = async (plan: TakeoverPlan, action: TakeoverAction) => {
    setExecutingPlanId(plan.id);
    try {
      const res = await apiFetch<{ success: boolean; data: TakeoverReceipt }>(
        `/plans/${plan.id}/execute`,
        activeUser.username,
        { method: "POST", body: JSON.stringify({ action }) }
      );
      if (res.success && res.data) {
        setExpandedReceiptId(res.data.id);
        if (res.data.status === "success") {
          showToast(`${TAKEOVER_ACTION_LABELS[action]}成功: ${res.data.actualPort ? `端口 ${res.data.actualPort}` : ""}`, "success");
        } else {
          showToast(`${TAKEOVER_ACTION_LABELS[action]}失败: ${res.data.conflictDescription || "未知原因"}`, "error");
        }
      } else {
        showToast("执行请求失败", "error");
      }
    } catch {
      showToast("执行异常", "error");
    } finally {
      setExecutingPlanId(null);
      loadAll();
    }
  };

  const handleUndoLast = async () => {
    try {
      const res = await apiFetch<{ success: boolean; data: TakeoverReceipt }>(
        "/receipts/undo-last",
        activeUser.username,
        { method: "POST" }
      );
      if (res.success && res.data) {
        setExpandedReceiptId(res.data.id);
        showToast(res.data.status === "success" ? "撤销成功" : "撤销失败", res.data.status === "success" ? "success" : "error");
      } else {
        showToast("没有可撤销的成功接管记录", "info");
      }
    } catch {
      showToast("撤销失败", "error");
    } finally {
      loadAll();
    }
  };

  const handleExport = async () => {
    try {
      const res = await apiFetch<TakeoverPlanExport>("/plans/export", activeUser.username);
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `takeover-plans-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("方案已导出", "success");
    } catch {
      showToast("导出失败", "error");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await apiFetch<{ success: boolean; data: { imported: number; skipped: number } }>(
        "/plans/import",
        activeUser.username,
        { method: "POST", body: text }
      );
      if (res.success) {
        showToast(`导入完成：成功 ${res.data.imported} 个，跳过 ${res.data.skipped} 个`, "success");
        loadAll();
      } else {
        showToast("导入失败", "error");
      }
    } catch {
      showToast("导入文件格式错误", "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const runningReceipts = useMemo(
    () =>
      receipts.filter((r) =>
        r.status === "success" && !r.isUndone && r.action !== "stop"
      ),
    [receipts]
  );

  if (loading) return <div className="p-8 text-sm text-slate-500">加载中…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-800">环境接管回执中心</h2>
          <select
            value={activeUserIdx}
            onChange={(e) => setActiveUserIdx(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
          >
            {DEV_USERS.map((u, i) => (
              <option key={u.username} value={i}>
                {u.label}
              </option>
            ))}
          </select>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
              activeUser.role === "admin"
                ? "bg-rose-50 text-rose-700"
                : "bg-blue-50 text-blue-700"
            )}
          >
            {activeUser.role === "admin" ? (
              <Shield className="h-3 w-3" />
            ) : (
              <UserIcon className="h-3 w-3" />
            )}
            {activeUser.role === "admin" ? "管理员" : "普通用户"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleUndoLast}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-orange-300 hover:text-orange-700"
          >
            <Undo2 className="h-4 w-4" />
            撤销最近接管
          </button>
          <button
            onClick={openApplyLastSuccess}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-violet-300 hover:text-violet-700"
          >
            <Repeat className="h-4 w-4" />
            回放成功方案
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300"
          >
            <Download className="h-4 w-4" />
            导出方案
          </button>
          <button
            onClick={handleImportClick}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300"
          >
            <Upload className="h-4 w-4" />
            导入方案
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            新建方案
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("plans")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition",
            activeTab === "plans"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          接管方案 ({plans.length})
        </button>
        <button
          onClick={() => setActiveTab("receipts")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition",
            activeTab === "receipts"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          接管回执 ({receipts.length})
        </button>
      </div>

      {activeTab === "plans" && (
        <>
          {runningReceipts.length > 0 && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <Server className="h-4 w-4" />
                当前接管的服务 ({runningReceipts.length})
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {runningReceipts.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-emerald-200 bg-white p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{r.planName}</span>
                      <div className="flex items-center gap-2">
                        <ActionBadge action={r.action} />
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div>PID: <span className="font-mono text-slate-800">{r.actualPid || "-"}</span></div>
                      <div>端口: <span className="font-mono text-slate-800">{r.actualPort || "-"}</span></div>
                      <div>操作人: {r.operatorUsername}</div>
                      <div>耗时: {r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "-"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            {plans.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                暂无方案，点击"新建方案"开始
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">名称</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">范围</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">所有者</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">端口</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">首页地址</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">API 地址</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {plans.map((plan) => (
                      <tr key={plan.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{plan.name}</div>
                          {plan.description && (
                            <div className="mt-0.5 truncate text-xs text-slate-500">
                              {plan.description}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-xs font-medium",
                              plan.scope === "public"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-slate-100 text-slate-700"
                            )}
                          >
                            {TAKEOVER_PLAN_SCOPE_LABELS[plan.scope]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{plan.ownerUsername}</td>
                        <td className="px-4 py-3 font-mono text-slate-700">{plan.expectedPort}</td>
                        <td className="px-4 py-3">
                          <code className="truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 max-w-[160px] inline-block align-bottom">
                            {plan.homePageUrl}
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          <code className="truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 max-w-[180px] inline-block align-bottom">
                            {plan.apiHealthUrl}
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleExecute(plan, "launch")}
                              disabled={executingPlanId === plan.id}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                              title="启动新进程"
                            >
                              <Play className="h-3 w-3" />
                              启动
                            </button>
                            <button
                              onClick={() => handleExecute(plan, "reuse")}
                              disabled={executingPlanId === plan.id}
                              className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
                              title="复用已有进程"
                            >
                              <Repeat className="h-3 w-3" />
                              复用
                            </button>
                            <button
                              onClick={() => handleExecute(plan, "stop")}
                              disabled={executingPlanId === plan.id}
                              className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-100 disabled:opacity-50"
                              title="停止服务"
                            >
                              <Square className="h-3 w-3" />
                              停止
                            </button>
                            {canModify(plan) ? (
                              <>
                                <button
                                  onClick={() => openEdit(plan)}
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                                >
                                  <Edit2 className="h-3 w-3" />
                                  编辑
                                </button>
                                <button
                                  onClick={() => handleDelete(plan)}
                                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            ) : (
                              <span
                                title="无权修改公共方案或他人私有方案"
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-400"
                              >
                                <Shield className="h-3 w-3" />
                                只读
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === "receipts" && (
        <section>
          {receipts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
              暂无接管回执
            </div>
          ) : (
            <div className="space-y-2">
              {receipts.map((r) => {
                const expanded = expandedReceiptId === r.id;
                return (
                  <div
                    key={r.id}
                    className={cn(
                      "overflow-hidden rounded-xl border bg-white shadow-sm",
                      r.isUndone && "border-slate-200 bg-slate-50/50 opacity-75"
                    )}
                  >
                    <button
                      onClick={() => setExpandedReceiptId(expanded ? null : r.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50"
                    >
                      <StatusBadge status={r.status} />
                      <ActionBadge action={r.action} />
                      <span className="font-medium text-slate-800">{r.planName}</span>
                      <span className="text-xs text-slate-500">#{r.id}</span>
                      {r.isUndone && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                          已撤销
                        </span>
                      )}
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>端口 {r.actualPort || "-"}</span>
                        <span>PID {r.actualPid || "-"}</span>
                        <span>操作人 {r.operatorUsername}</span>
                        <span>{new Date(r.createdAt).toLocaleString()}</span>
                        {r.durationMs && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {(r.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                      {expanded ? (
                        <ChevronUp className="ml-auto h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />
                      )}
                    </button>
                    {expanded && (
                      <div className="border-t border-slate-100 bg-slate-50/60 p-4">
                        <div className="grid gap-3 md:grid-cols-4">
                          <div className="rounded-lg bg-white p-3">
                            <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                              <Home className="h-3 w-3" />
                              首页检测
                            </div>
                            <CheckBadge status={r.homePageCheck.status} />
                            {r.homePageCheck.message && (
                              <div className="mt-1 text-[11px] text-slate-500">
                                {r.homePageCheck.message}
                              </div>
                            )}
                            {r.homePageCheck.httpStatus && (
                              <div className="mt-0.5 text-[11px] text-slate-400">
                                HTTP {r.homePageCheck.httpStatus}
                              </div>
                            )}
                          </div>
                          <div className="rounded-lg bg-white p-3">
                            <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                              <Activity className="h-3 w-3" />
                              API 健康
                            </div>
                            <CheckBadge status={r.apiHealthCheck.status} />
                            {r.apiHealthCheck.message && (
                              <div className="mt-1 text-[11px] text-slate-500">
                                {r.apiHealthCheck.message}
                              </div>
                            )}
                            {r.apiHealthCheck.httpStatus && (
                              <div className="mt-0.5 text-[11px] text-slate-400">
                                HTTP {r.apiHealthCheck.httpStatus}
                              </div>
                            )}
                          </div>
                          <div className="rounded-lg bg-white p-3">
                            <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                              <FileKey className="h-3 w-3" />
                              进程归属
                            </div>
                            <CheckBadge status={r.processOwnershipCheck.status} />
                            {r.processOwnershipCheck.message && (
                              <div className="mt-1 text-[11px] text-slate-500">
                                {r.processOwnershipCheck.message}
                              </div>
                            )}
                          </div>
                          <div className="rounded-lg bg-white p-3">
                            <div className="mb-1 text-xs font-medium text-slate-500">结果</div>
                            {r.status === "success" ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                三项校验全部通过
                              </span>
                            ) : r.status === "failed" ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                                <XCircle className="h-3.5 w-3.5" />
                                未通过
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">-</span>
                            )}
                          </div>
                        </div>

                        {r.portOccupier && (
                          <div className="mt-4 rounded-lg bg-white p-3">
                            <div className="mb-2 text-xs font-medium text-slate-500">端口占用检测</div>
                            <div className="grid gap-2 text-xs md:grid-cols-2">
                              <div>
                                <span className="text-slate-500">端口: </span>
                                <span className="font-mono">{r.portOccupier.port}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">状态: </span>
                                <span className={r.portOccupier.isOccupied ? "text-red-600" : "text-emerald-600"}>
                                  {r.portOccupier.isOccupied ? "已占用" : "空闲"}
                                </span>
                              </div>
                              {r.portOccupier.pid && (
                                <>
                                  <div>
                                    <span className="text-slate-500">PID: </span>
                                    <span className="font-mono">{r.portOccupier.pid}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">进程名: </span>
                                    <span className="font-mono">{r.portOccupier.processName || "-"}</span>
                                  </div>
                                  <div className="md:col-span-2">
                                    <span className="text-slate-500">归属: </span>
                                    <span className={r.portOccupier.belongsToWorkspace ? "text-emerald-600" : r.portOccupier.belongsToWorkspace === false ? "text-amber-600" : "text-slate-400"}>
                                      {r.portOccupier.belongsToWorkspace ? "本项目进程" : r.portOccupier.belongsToWorkspace === false ? "外部进程" : "归属未确认"}
                                    </span>
                                  </div>
                                </>
                              )}
                              {r.portOccupier.suggestion && (
                                <div className="md:col-span-2">
                                  <span className="text-slate-500">建议: </span>
                                  <span className="text-slate-700">{r.portOccupier.suggestion}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {r.conflictDescription && (
                          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                            <div className="mb-1 flex items-center gap-1 text-xs font-medium text-red-700">
                              <AlertTriangle className="h-3 w-3" />
                              冲突说明
                            </div>
                            <div className="text-sm text-red-700">{r.conflictDescription}</div>
                          </div>
                        )}

                        {r.handlingSuggestion && (
                          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <div className="mb-1 flex items-center gap-1 text-xs font-medium text-amber-700">
                              <LightbulbIcon className="h-3 w-3" />
                              处理建议
                            </div>
                            <div className="text-sm text-amber-700">{r.handlingSuggestion}</div>
                          </div>
                        )}

                        {r.timeline.length > 0 && (
                          <div className="mt-4">
                            <div className="mb-2 text-xs font-medium text-slate-500">执行时间线</div>
                            <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
                              {r.timeline.map((t, i) => (
                                <li key={i} className="relative">
                                  <span className="absolute -left-[21px] top-1 block h-3 w-3 rounded-full border-2 border-white bg-slate-300" />
                                  <div className="text-sm text-slate-700">{t.event}</div>
                                  {t.detail && (
                                    <div className="text-xs text-slate-500">{t.detail}</div>
                                  )}
                                  <div className="text-[11px] text-slate-400">
                                    {new Date(t.timestamp).toLocaleTimeString()}
                                  </div>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="text-base font-semibold text-slate-800">
                {editingPlan ? "编辑接管方案" : "新建接管方案"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">方案名称</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：全栈开发环境"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">方案描述（可选）</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="简要描述该方案的用途"
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none resize-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">范围</label>
                <select
                  value={form.scope}
                  onChange={(e) =>
                    setForm({ ...form, scope: e.target.value as TakeoverPlanScope })
                  }
                  disabled={activeUser.role !== "admin" && form.scope === "public"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-100"
                >
                  <option value="private">私有方案</option>
                  {activeUser.role === "admin" && (
                    <option value="public">公共方案</option>
                  )}
                </select>
                {activeUser.role !== "admin" && (
                  <p className="mt-1 text-[11px] text-amber-600">
                    <AlertTriangle className="mr-0.5 inline h-3 w-3 align-text-bottom" />
                    仅管理员可创建公共方案
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">前端启动命令（可选）</label>
                  <input
                    value={form.frontendCommand}
                    onChange={(e) => setForm({ ...form, frontendCommand: e.target.value })}
                    placeholder="例如：npm run client:dev"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">后端启动命令（可选）</label>
                  <input
                    value={form.backendCommand}
                    onChange={(e) => setForm({ ...form, backendCommand: e.target.value })}
                    placeholder="例如：npm run server:dev"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    预期端口
                    {portChecking && (
                      <span className="ml-2 text-slate-400">(检测中…)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={form.expectedPort}
                    onChange={(e) => setForm({ ...form, expectedPort: Number(e.target.value) })}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none",
                      portCheck?.isOccupied
                        ? "border-red-300 focus:border-red-400"
                        : "border-slate-300 focus:border-blue-400"
                    )}
                  />
                  {portCheck && !portChecking && (
                    <p
                      className={cn(
                        "mt-1 text-[11px]",
                        portCheck.isOccupied ? "text-red-600" : "text-emerald-600"
                      )}
                    >
                      {portCheck.isOccupied ? (
                        <>
                          <XCircle className="mr-0.5 inline h-3 w-3 align-text-bottom" />
                          {portCheck.suggestion}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-0.5 inline h-3 w-3 align-text-bottom" />
                          端口可用
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">超时时间（秒）</label>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={form.timeoutSec}
                    onChange={(e) =>
                      setForm({ ...form, timeoutSec: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">首页地址</label>
                <input
                  value={form.homePageUrl}
                  onChange={(e) => setForm({ ...form, homePageUrl: e.target.value })}
                  placeholder="例如：http://localhost:5178/"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">API 健康地址</label>
                <input
                  value={form.apiHealthUrl}
                  onChange={(e) => setForm({ ...form, apiHealthUrl: e.target.value })}
                  placeholder="例如：http://localhost:3088/api/health"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                {editingPlan ? "保存修改" : "创建方案"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LightbulbIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}
