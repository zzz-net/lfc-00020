import { useEffect, useMemo, useState } from "react";
import {
  Play,
  Square,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Copy,
  Server,
  Globe,
  Shield,
  User as UserIcon,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";
import type {
  LaunchConfig,
  VerificationRecord,
  User as UserType,
  LaunchStatus,
  ServiceType,
  LaunchConfigScope,
  PortCheckResult,
} from "../../shared/types";
import {
  LAUNCH_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  CONFIG_SCOPE_LABELS,
  VERIFICATION_STEP_LABELS,
  USER_ROLE_LABELS,
} from "../../shared/types";

const API_BASE = "/api/devworkbench";

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

function StatusBadge({ status }: { status: LaunchStatus }) {
  const colorMap: Record<string, string> = {
    idle: "bg-slate-100 text-slate-700",
    starting: "bg-amber-100 text-amber-700",
    running: "bg-sky-100 text-sky-700",
    verifying: "bg-violet-100 text-violet-700",
    success: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
    stopping: "bg-orange-100 text-orange-700",
    stopped: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        colorMap[status]
      )}
    >
      {LAUNCH_STATUS_LABELS[status]}
    </span>
  );
}

function StepBadge({ status }: { status: "pending" | "running" | "success" | "failed" }) {
  const map = {
    pending: "bg-slate-100 text-slate-600",
    running: "bg-amber-100 text-amber-700",
    success: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
  };
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", map[status])}>
      {VERIFICATION_STEP_LABELS[status]}
    </span>
  );
}

export default function DevWorkbench() {
  const { showToast } = useAppStore();
  const [activeUserIdx, setActiveUserIdx] = useState(0);
  const activeUser = DEV_USERS[activeUserIdx];
  const [userInfo, setUserInfo] = useState<UserType | null>(null);
  const [configs, setConfigs] = useState<LaunchConfig[]>([]);
  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<LaunchConfig | null>(null);
  const [expandedRecordId, setExpandedRecordId] = useState<number | null>(null);
  const [launchingId, setLaunchingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: "",
    scope: "private" as LaunchConfigScope,
    serviceType: "backend" as ServiceType,
    command: "npm run server:dev",
    cwd: "",
    fixedPort: 3001,
    healthCheckUrl: "http://localhost:3001/api/health",
    startupTimeoutSec: 30,
  });
  const [portCheck, setPortCheck] = useState<PortCheckResult | null>(null);
  const [portChecking, setPortChecking] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [meRes, cfgRes, recRes] = await Promise.all([
        apiFetch<{ success: boolean; data: UserType }>("/users/me", activeUser.username),
        apiFetch<{ success: boolean; data: LaunchConfig[] }>("/configs", activeUser.username),
        apiFetch<{ success: boolean; data: VerificationRecord[] }>("/verifications?limit=20", activeUser.username),
      ]);
      setUserInfo(meRes.data || null);
      setConfigs(cfgRes.data || []);
      setRecords(recRes.data || []);
    } catch {
      showToast("加载工作台数据失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [activeUser.username]);

  useEffect(() => {
    if (!form.fixedPort) return;
    let cancelled = false;
    setPortChecking(true);
    apiFetch<{ success: boolean; data: PortCheckResult }>(
      `/ports/${form.fixedPort}/check`,
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
  }, [form.fixedPort, activeUser.username]);

  const resetForm = () => {
    setForm({
      name: "",
      scope: activeUser.role === "admin" ? "public" : "private",
      serviceType: "backend",
      command: "npm run server:dev",
      cwd: "",
      fixedPort: 3001,
      healthCheckUrl: "http://localhost:3001/api/health",
      startupTimeoutSec: 30,
    });
    setEditingConfig(null);
    setPortCheck(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (cfg: LaunchConfig) => {
    setForm({
      name: cfg.name,
      scope: cfg.scope,
      serviceType: cfg.serviceType,
      command: cfg.command,
      cwd: cfg.cwd,
      fixedPort: cfg.fixedPort,
      healthCheckUrl: cfg.healthCheckUrl,
      startupTimeoutSec: cfg.startupTimeoutSec,
    });
    setEditingConfig(cfg);
    setShowForm(true);
  };

  const openApplyLastSuccess = async () => {
    try {
      const res = await apiFetch<{ success: boolean; data: LaunchConfig | null }>(
        "/configs/last-success",
        activeUser.username
      );
      if (!res.data) {
        showToast("暂无成功启动记录", "info");
        return;
      }
      const cfg = res.data;
      setForm({
        name: `${cfg.name} (副本)`,
        scope: "private",
        serviceType: cfg.serviceType,
        command: cfg.command,
        cwd: cfg.cwd,
        fixedPort: cfg.fixedPort,
        healthCheckUrl: cfg.healthCheckUrl,
        startupTimeoutSec: cfg.startupTimeoutSec,
      });
      setEditingConfig(null);
      setShowForm(true);
      showToast("已套用上次成功配置", "success");
    } catch {
      showToast("获取上次成功配置失败", "error");
    }
  };

  const canModify = (cfg: LaunchConfig) => {
    if (activeUser.role === "admin") return true;
    if (cfg.scope === "public") return false;
    return cfg.ownerUsername === activeUser.username;
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      showToast("请输入配置名称", "error");
      return;
    }
    if (form.scope === "public" && activeUser.role !== "admin") {
      showToast("仅管理员可创建公共配置", "error");
      return;
    }
    try {
      if (editingConfig) {
        await apiFetch(`/configs/${editingConfig.id}`, activeUser.username, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        showToast("配置已更新", "success");
      } else {
        await apiFetch("/configs", activeUser.username, {
          method: "POST",
          body: JSON.stringify(form),
        });
        showToast("配置已创建", "success");
      }
      setShowForm(false);
      loadAll();
    } catch {
      showToast("保存配置失败", "error");
    }
  };

  const handleDelete = async (cfg: LaunchConfig) => {
    if (!confirm(`确定删除配置 "${cfg.name}" 吗？`)) return;
    try {
      await apiFetch(`/configs/${cfg.id}`, activeUser.username, { method: "DELETE" });
      showToast("配置已删除", "success");
      loadAll();
    } catch {
      showToast("删除失败", "error");
    }
  };

  const handleLaunch = async (cfg: LaunchConfig) => {
    setLaunchingId(cfg.id);
    try {
      const res = await apiFetch<{ success: boolean; data: VerificationRecord }>(
        `/configs/${cfg.id}/launch`,
        activeUser.username,
        { method: "POST" }
      );
      if (res.success && res.data) {
        setExpandedRecordId(res.data.id);
        if (res.data.status === "success") {
          showToast(`启动成功: PID ${res.data.pid}, 端口 ${res.data.actualPort}`, "success");
        } else {
          showToast(`启动失败: ${res.data.failureReason || "未知原因"}`, "error");
        }
      } else {
        showToast("启动请求失败", "error");
      }
    } catch {
      showToast("启动异常", "error");
    } finally {
      setLaunchingId(null);
      loadAll();
    }
  };

  const handleStop = async (pid: number) => {
    if (activeUser.role !== "admin") {
      showToast("仅管理员可停止进程", "error");
      return;
    }
    try {
      await apiFetch(`/processes/${pid}/stop`, activeUser.username, { method: "POST" });
      showToast("停止指令已发送", "info");
      loadAll();
    } catch {
      showToast("停止失败", "error");
    }
  };

  const runningRecords = useMemo(
    () =>
      records.filter((r) =>
        ["starting", "running", "verifying", "success"].includes(r.status)
      ),
    [records]
  );

  if (loading) return <div className="p-8 text-sm text-slate-500">加载中…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-800">启动配置与验真工作台</h2>
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
          {userInfo && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                userInfo.role === "admin"
                  ? "bg-rose-50 text-rose-700"
                  : "bg-blue-50 text-blue-700"
              )}
            >
              {userInfo.role === "admin" ? (
                <Shield className="h-3 w-3" />
              ) : (
                <UserIcon className="h-3 w-3" />
              )}
              {USER_ROLE_LABELS[userInfo.role]}: {userInfo.displayName}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={openApplyLastSuccess}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-violet-300 hover:text-violet-700"
          >
            <Copy className="h-4 w-4" />
            套用上次成功配置
          </button>
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
            新建配置
          </button>
        </div>
      </div>

      {/* Running services */}
      {runningRecords.length > 0 && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <Server className="h-4 w-4" />
            运行中的服务 ({runningRecords.length})
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {runningRecords.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-emerald-200 bg-white p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800">{r.configName}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>PID: <span className="font-mono text-slate-800">{r.pid}</span></div>
                  <div>端口: <span className="font-mono text-slate-800">{r.actualPort}</span></div>
                  <div>操作人: {r.operatorUsername}</div>
                  <div>耗时: {r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "-"}</div>
                </div>
                {activeUser.role === "admin" && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => handleStop(r.pid)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      <Square className="h-3 w-3" />
                      停止
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Configs */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">启动配置</h3>
        {configs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            暂无配置，点击"新建配置"开始
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">名称</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">类型</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">范围</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">所有者</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">端口</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">命令</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {configs.map((cfg) => (
                  <tr key={cfg.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{cfg.name}</div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {cfg.healthCheckUrl}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
                          cfg.serviceType === "backend"
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-teal-50 text-teal-700"
                        )}
                      >
                        {cfg.serviceType === "backend" ? (
                          <Server className="h-3 w-3" />
                        ) : (
                          <Globe className="h-3 w-3" />
                        )}
                        {SERVICE_TYPE_LABELS[cfg.serviceType]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-xs font-medium",
                          cfg.scope === "public"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-slate-100 text-slate-700"
                        )}
                      >
                        {CONFIG_SCOPE_LABELS[cfg.scope]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{cfg.ownerUsername}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{cfg.fixedPort}</td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                        {cfg.command}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleLaunch(cfg)}
                          disabled={launchingId === cfg.id}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" />
                          {launchingId === cfg.id ? "启动中…" : "启动"}
                        </button>
                        {canModify(cfg) ? (
                          <>
                            <button
                              onClick={() => openEdit(cfg)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                              <Edit2 className="h-3 w-3" />
                              编辑
                            </button>
                            <button
                              onClick={() => handleDelete(cfg)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <span
                            title="无权修改公共配置或他人私有配置"
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

      {/* Verification records */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">验真记录 (最近 20 条)</h3>
        {records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            暂无验真记录
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((r) => {
              const expanded = expandedRecordId === r.id;
              return (
                <div
                  key={r.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  <button
                    onClick={() => setExpandedRecordId(expanded ? null : r.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50"
                  >
                    <StatusBadge status={r.status} />
                    <span className="font-medium text-slate-800">{r.configName}</span>
                    <span className="text-xs text-slate-500">#{r.id}</span>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>端口 {r.actualPort || "-"}</span>
                      <span>PID {r.pid || "-"}</span>
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
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg bg-white p-3">
                          <div className="mb-1 text-xs font-medium text-slate-500">页面探活</div>
                          <StepBadge status={r.pageCheckStatus} />
                        </div>
                        <div className="rounded-lg bg-white p-3">
                          <div className="mb-1 text-xs font-medium text-slate-500">接口探活</div>
                          <StepBadge status={r.apiCheckStatus} />
                        </div>
                        <div className="rounded-lg bg-white p-3">
                          <div className="mb-1 text-xs font-medium text-slate-500">结果</div>
                          {r.status === "success" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              全部通过
                            </span>
                          ) : r.status === "failed" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                              <XCircle className="h-3.5 w-3.5" />
                              {r.failureReason || "失败"}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">-</span>
                          )}
                        </div>
                      </div>
                      {r.timeline.length > 0 && (
                        <div className="mt-4">
                          <div className="mb-2 text-xs font-medium text-slate-500">时间线</div>
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

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="text-base font-semibold text-slate-800">
                {editingConfig ? "编辑配置" : "新建启动配置"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">配置名称</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：后端开发服务"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">服务类型</label>
                  <select
                    value={form.serviceType}
                    onChange={(e) =>
                      setForm({ ...form, serviceType: e.target.value as ServiceType })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  >
                    <option value="backend">后端</option>
                    <option value="frontend">前端</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">范围</label>
                  <select
                    value={form.scope}
                    onChange={(e) =>
                      setForm({ ...form, scope: e.target.value as LaunchConfigScope })
                    }
                    disabled={activeUser.role !== "admin" && form.scope === "public"}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-100"
                  >
                    <option value="private">私有配置</option>
                    {activeUser.role === "admin" && (
                      <option value="public">公共配置</option>
                    )}
                  </select>
                  {activeUser.role !== "admin" && (
                    <p className="mt-1 text-[11px] text-amber-600">
                      <AlertTriangle className="mr-0.5 inline h-3 w-3 align-text-bottom" />
                      仅管理员可创建公共配置
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">启动命令</label>
                <input
                  value={form.command}
                  onChange={(e) => setForm({ ...form, command: e.target.value })}
                  placeholder="例如：npm run server:dev"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">工作目录</label>
                <input
                  value={form.cwd}
                  onChange={(e) => setForm({ ...form, cwd: e.target.value })}
                  placeholder="留空使用项目根目录"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    固定端口
                    {portChecking && (
                      <span className="ml-2 text-slate-400">(检测中…)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={form.fixedPort}
                    onChange={(e) => setForm({ ...form, fixedPort: Number(e.target.value) })}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none",
                      portCheck?.isAvailable === false
                        ? "border-red-300 focus:border-red-400"
                        : "border-slate-300 focus:border-blue-400"
                    )}
                  />
                  {portCheck && !portChecking && (
                    <p
                      className={cn(
                        "mt-1 text-[11px]",
                        portCheck.isAvailable ? "text-emerald-600" : "text-red-600"
                      )}
                    >
                      {portCheck.isAvailable ? (
                        <>
                          <CheckCircle2 className="mr-0.5 inline h-3 w-3 align-text-bottom" />
                          端口可用
                        </>
                      ) : (
                        <>
                          <XCircle className="mr-0.5 inline h-3 w-3 align-text-bottom" />
                          {portCheck.suggestion}
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">启动超时 (秒)</label>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={form.startupTimeoutSec}
                    onChange={(e) =>
                      setForm({ ...form, startupTimeoutSec: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">健康检查地址</label>
                <input
                  value={form.healthCheckUrl}
                  onChange={(e) => setForm({ ...form, healthCheckUrl: e.target.value })}
                  placeholder="例如：http://localhost:3001/api/health"
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
                {editingConfig ? "保存修改" : "创建配置"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
