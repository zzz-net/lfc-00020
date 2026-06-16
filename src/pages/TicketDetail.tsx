import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  Ticket,
  Note,
  AuditLog,
  OperationSnapshot,
  Technician,
  TicketStatus,
  TechnicianAvailability,
} from "../../shared/types";
import type { LucideIcon } from "lucide-react";
import { STATUS_LABELS, SKILL_LABELS } from "../../shared/types";
import StatusBadge from "@/components/StatusBadge";
import UrgencyBadge from "@/components/UrgencyBadge";
import SkillTag from "@/components/SkillTag";
import { useAppStore } from "@/store";
import {
  ArrowLeft,
  Undo2,
  Send,
  CheckCircle2,
  XCircle,
  UserPlus,
  Clock,
  MapPin,
  Phone,
  User2,
  CalendarDays,
  AlertTriangle,
  FileText,
  History,
  MessageSquarePlus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_FLOW: Record<TicketStatus, TicketStatus[]> = {
  pending_assign: [], // 派单会直接进 in_progress
  in_progress: ["pending_verify"],
  pending_verify: ["closed"],
  closed: [],
};

const NEXT_LABEL: Record<string, { label: string; cls: string; icon: LucideIcon }> = {
  "in_progress->pending_verify": {
    label: "提交验收",
    cls: "bg-amber-600 hover:bg-amber-700",
    icon: CheckCircle2,
  },
  "pending_verify->closed": {
    label: "关闭工单",
    cls: "bg-emerald-600 hover:bg-emerald-700",
    icon: XCircle,
  },
};

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentOperator, showToast } = useAppStore();
  const ticketId = Number(id);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [undoSnapshot, setUndoSnapshot] = useState<OperationSnapshot | null>(null);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [availability, setAvailability] = useState<TechnicianAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/tickets/${ticketId}`),
        fetch("/api/technicians"),
      ]);
      const d1 = await r1.json();
      const d2 = await r2.json();
      setTicket(d1.data.ticket);
      setNotes(d1.data.notes ?? []);
      setAuditLogs(d1.data.auditLogs ?? []);
      setUndoSnapshot(d1.data.undoSnapshot ?? null);
      setTechs(d2.data ?? []);
      if (d1.data.ticket?.status === "pending_assign") {
        const r3 = await fetch(`/api/tickets/${ticketId}/available-technicians`);
        const d3 = await r3.json();
        setAvailability(d3.data ?? []);
      }
    } catch {
      showToast("加载失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ticketId || !Number.isFinite(ticketId)) {
      showToast("无效的工单ID", "error");
      navigate("/");
      return;
    }
    load();
  }, [ticketId]);

  const isClosed = ticket?.status === "closed";

  // ✨ 核心：撤销入口只看快照是否存在，不限 closed 态
  // 但 closed 态给出额外提示说明回退的是最近一次关闭操作
  const canUndo = undoSnapshot !== null;
  const canAssign = !isClosed && ticket?.status === "pending_assign";

  const handleAssign = async (techId: number) => {
    if (!canAssign) return;
    setBusy("assign:" + techId);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId: techId, operator: currentOperator }),
      });
      const j = await res.json();
      if (res.ok) {
        showToast("派单成功", "success");
        load();
      } else {
        showToast("派单失败：" + (j.error ?? "未知错误"), "error");
      }
    } finally {
      setBusy(null);
    }
  };

  const handleStatus = async (next: TicketStatus) => {
    if (isClosed) return;
    setBusy("status:" + next);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, operator: currentOperator }),
      });
      const j = await res.json();
      if (res.ok) {
        showToast("状态已更新", "success");
        load();
      } else {
        showToast("操作失败：" + (j.error ?? "未知错误"), "error");
      }
    } finally {
      setBusy(null);
    }
  };

  const handleUndo = async () => {
    if (!canUndo) return;
    const prevLabel = undoSnapshot?.previousStatus
      ? STATUS_LABELS[undoSnapshot.previousStatus as TicketStatus]
      : "上一个状态";
    const ok = confirm(
      isClosed
        ? `确定撤销本次关闭？工单将回退到「${prevLabel}」，并保留审计记录。\n（关闭后仍可撤销最近一次状态变更）`
        : `确定撤销最近一次操作？工单将回退到「${prevLabel}」，并保留审计记录。`
    );
    if (!ok) return;
    setBusy("undo");
    try {
      const res = await fetch(`/api/tickets/${ticketId}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator: currentOperator }),
      });
      const j = await res.json();
      if (res.ok) {
        showToast(isClosed ? "已撤销关闭，状态已回退" : "已撤销", "success");
        load();
      } else {
        showToast("撤销失败：" + (j.error ?? "未知错误"), "error");
      }
    } finally {
      setBusy(null);
    }
  };

  const handleAddNote = async () => {
    const txt = noteText.trim();
    if (!txt) return;
    setBusy("note");
    try {
      const res = await fetch(`/api/tickets/${ticketId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: txt, operator: currentOperator }),
      });
      const j = await res.json();
      if (res.ok) {
        showToast("备注已添加", "success");
        setNoteText("");
        load();
      } else {
        showToast("添加失败：" + (j.error ?? "未知错误"), "error");
      }
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-2 text-sm text-slate-500">加载中…</span>
      </div>
    );
  }

  if (!ticket) {
    return <div className="p-8 text-sm text-slate-500">工单不存在</div>;
  }

  const nextStates = STATUS_FLOW[ticket.status] ?? [];

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" />
            返回工作台
          </button>
          <h2 className="text-xl font-semibold text-slate-800">
            <span className="mr-2 font-mono text-slate-400">{ticket.ticketNo}</span>
            {ticket.title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={ticket.status} size="md" />
          <UrgencyBadge urgency={ticket.urgency} />
        </div>
      </div>

      {/* closed 态顶部提示 */}
      {isClosed && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <div className="font-medium">工单已关闭</div>
            <div className="mt-0.5 text-emerald-700/90">
              关闭后<span className="font-semibold">不能改派或直接变更状态</span>，但可使用「撤销」按钮
              回退到关闭前状态（「{undoSnapshot ? STATUS_LABELS[undoSnapshot.previousStatus as TicketStatus] : '—'}」），
              并留下审计记录。
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Basic info + actions */}
        <div className="col-span-2 space-y-6">
          {/* Info card */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <FileText className="h-4 w-4" />
              工单信息
            </h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <InfoRow icon={MapPin} label="报修地点" value={ticket.location} />
              <InfoRow icon={CalendarDays} label="期望完成" value={ticket.expectedDate} />
              <InfoRow icon={User2} label="联系人" value={ticket.contactName} />
              <InfoRow icon={Phone} label="联系电话" value={ticket.contactPhone} />
              <InfoRow icon={Clock} label="创建时间" value={new Date(ticket.createdAt).toLocaleString("zh-CN")} />
              <InfoRow
                icon={Clock}
                label="更新时间"
                value={new Date(ticket.updatedAt).toLocaleString("zh-CN")}
              />
              <div className="col-span-2">
                <div className="mb-1 text-xs text-slate-500">故障描述</div>
                <div className="rounded-lg bg-slate-50 p-3 text-slate-700">{ticket.description}</div>
              </div>
              <div className="col-span-2">
                <div className="mb-1 text-xs text-slate-500">指派技师</div>
                <div className="flex items-center gap-2">
                  {ticket.technicianName ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700 border border-indigo-200">
                      <UserPlus className="h-4 w-4" />
                      {ticket.technicianName}
                      {ticket.assignedAt && (
                        <span className="ml-1 text-xs text-indigo-500">
                          · {new Date(ticket.assignedAt).toLocaleDateString("zh-CN")}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-sm">未派单</span>
                  )}
                  {isClosed && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">
                      <AlertTriangle className="h-3 w-3" />
                      已关闭，不可改派
                    </span>
                  )}
                </div>
              </div>
            </dl>
          </section>

          {/* Actions */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Send className="h-4 w-4" />
              操作面板
            </h3>

            {/* 状态推进按钮：closed 态不显示（需通过撤销） */}
            {!isClosed && nextStates.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {nextStates.map((s) => {
                  const key = `${ticket.status}->${s}`;
                  const cfg = NEXT_LABEL[key];
                  const Icon = cfg?.icon ?? Send;
                  return (
                    <button
                      key={s}
                      disabled={busy !== null}
                      onClick={() => handleStatus(s)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition disabled:opacity-50",
                        cfg?.cls ?? "bg-blue-600 hover:bg-blue-700"
                      )}
                    >
                      {busy === "status:" + s ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                      {cfg?.label ?? `推进到 ${STATUS_LABELS[s]}`}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {/* ✨ 撤销按钮：只要有快照就显示，不排除 closed 态 */}
              <button
                disabled={!canUndo || busy !== null}
                onClick={handleUndo}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40",
                  canUndo
                    ? "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"
                    : "border-slate-200 bg-slate-50 text-slate-400"
                )}
                title={
                  canUndo
                    ? isClosed
                      ? "撤销最近一次关闭，回退到关闭前状态"
                      : "撤销最近一次派单或状态变更"
                    : "没有可撤销的操作"
                }
              >
                {busy === "undo" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Undo2 className="h-4 w-4" />
                )}
                {isClosed ? "撤销关闭" : "撤销上一步"}
                {canUndo && undoSnapshot?.previousStatus && (
                  <span className="ml-1 rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-orange-600 border border-orange-200">
                    →{STATUS_LABELS[undoSnapshot.previousStatus as TicketStatus]}
                  </span>
                )}
              </button>

              {/* 改派/派单按钮：closed 态禁用 */}
              {canAssign ? (
                <span className="inline-flex items-center rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 border border-blue-200">
                  请在下方「派单面板」选择技师
                </span>
              ) : isClosed ? (
                <span
                  className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400"
                  title="已关闭工单不能改派"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  已关闭·不能改派
                </span>
              ) : (
                <span className="inline-flex items-center rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 border border-slate-200">
                  已派单（需先撤销才能改派）
                </span>
              )}
            </div>

            {/* 操作说明 */}
            <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 leading-relaxed border border-slate-100">
              <div className="font-medium text-slate-600 mb-1">操作说明</div>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>状态推进：<span className="font-mono">待派单 → 派单 → 处理中 → 待验收 → 关闭</span></li>
                <li>可撤销最近一次派单或状态变更（<span className="text-orange-600 font-medium">包含关闭后撤销</span>），撤销操作本身会写入审计日志且不可再撤销</li>
                <li>已关闭工单<span className="text-red-600 font-medium">不能改派或直接变更状态</span>，需先撤销关闭</li>
              </ul>
            </div>
          </section>

          {/* Notes */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <MessageSquarePlus className="h-4 w-4" />
              备注 ({notes.length})
            </h3>
            <div className="mb-4 flex gap-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                placeholder="添加备注…（Enter 提交）"
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-400 focus:bg-white focus:outline-none"
              />
              <button
                disabled={!noteText.trim() || busy !== null}
                onClick={handleAddNote}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-40"
              >
                {busy === "note" ? <Loader2 className="h-4 w-4 animate-spin" /> : "提交"}
              </button>
            </div>
            {notes.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">暂无备注</div>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{n.operator}</span>
                      <span>{new Date(n.createdAt).toLocaleString("zh-CN")}</span>
                    </div>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right: Assign panel + audit */}
        <div className="space-y-6">
          {/* Assign panel */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <UserPlus className="h-4 w-4" />
              {isClosed ? "派单面板（已关闭）" : canAssign ? "选择技师派单" : "技师信息"}
            </h3>

            {isClosed ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-400">
                <AlertTriangle className="mx-auto mb-2 h-5 w-5" />
                <div>已关闭工单不能改派</div>
                <div className="mt-1 text-slate-500">如需重新派单，请先撤销关闭</div>
              </div>
            ) : canAssign ? (
              availability.length === 0 ? (
                <div className="text-xs text-slate-400">加载中…</div>
              ) : (
                <ul className="space-y-3">
                  {availability.map((a) => (
                    <li
                      key={a.technician.id}
                      className={cn(
                        "rounded-lg border p-3 transition",
                        a.available
                          ? "border-indigo-200 bg-indigo-50/40"
                          : "border-slate-200 bg-slate-50 opacity-70"
                      )}
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-800">
                          {a.technician.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {a.technician.employeeId}
                        </span>
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1">
                        {a.technician.skills.map((s) => (
                          <SkillTag key={s} skill={s} />
                        ))}
                      </div>
                      <div className="mb-2 space-y-0.5 text-[11px] text-slate-500">
                        <div>
                          当日：{a.dailyAssignedCount}/{a.technician.dailyLimit}
                        </div>
                        {a.reasons.length > 0 && (
                          <div className="text-red-600">⚠ {a.reasons.join("；")}</div>
                        )}
                        {!a.skillMatch && a.missingSkills.length > 0 && (
                          <div className="text-orange-600">
                            技能不匹配：缺 {a.missingSkills.map((s) => SKILL_LABELS[s]).join("/")}
                          </div>
                        )}
                      </div>
                      <button
                        disabled={!a.available || busy === "assign:" + a.technician.id}
                        onClick={() => handleAssign(a.technician.id)}
                        className={cn(
                          "w-full rounded-md px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                          a.available
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "bg-slate-200 text-slate-500"
                        )}
                      >
                        {busy === "assign:" + a.technician.id ? (
                          <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
                        ) : a.available ? (
                          "立即派单"
                        ) : (
                          "不可用"
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              ticket.technicianId && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">
                      {ticket.technicianName}
                    </span>
                    {ticket.assignedAt && (
                      <span className="text-[11px] text-slate-400">
                        派单：{new Date(ticket.assignedAt).toLocaleDateString("zh-CN")}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {techs
                      .find((t) => t.id === ticket.technicianId)
                      ?.skills.map((s) => (
                        <SkillTag key={s} skill={s} />
                      ))}
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    如需改派，请先撤销当前派单
                  </div>
                </div>
              )
            )}
          </section>

          {/* Audit log */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <History className="h-4 w-4" />
              审计日志 ({auditLogs.length})
            </h3>
            <ol className="relative space-y-4 border-l border-slate-200 pl-5">
              {auditLogs
                .slice()
                .sort((a, b) => a.id - b.id)
                .map((a) => (
                  <li key={a.id} className="relative">
                    <span
                      className={cn(
                        "-left-[27px] absolute top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white",
                        a.action === "undo"
                          ? "bg-orange-500 ring-2 ring-orange-200"
                          : a.action === "create"
                          ? "bg-blue-500 ring-2 ring-blue-200"
                          : a.action === "status_change"
                          ? "bg-emerald-500 ring-2 ring-emerald-200"
                          : a.action === "assign"
                          ? "bg-violet-500 ring-2 ring-violet-200"
                          : "bg-slate-400 ring-2 ring-slate-200"
                      )}
                    />
                    <div className="flex items-baseline justify-between">
                      <div className="text-sm font-medium text-slate-800">
                        {ACTION_LABEL[a.action] ?? a.action}
                        {a.undoOfId && (
                          <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700 border border-orange-200">
                            撤销 #{a.undoOfId}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(a.createdAt).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="text-xs text-slate-600">{a.description}</div>
                    <div className="text-[11px] text-slate-400">操作人：{a.operator}</div>
                  </li>
                ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  create: "创建工单",
  assign: "派单",
  status_change: "状态变更",
  undo: "撤销操作",
  note_add: "添加备注",
  technician_create: "新增技师",
  technician_update: "更新技师",
  technician_delete: "删除技师",
  vacation_create: "新增休假",
};

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-sm text-slate-800">{value}</div>
    </div>
  );
}
