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
  ReworkApplication,
} from "../../shared/types";
import type { LucideIcon } from "lucide-react";
import {
  REWORK_STATUS_COLORS,
  REWORK_STATUS_LABELS,
  SKILL_LABELS,
  STATUS_LABELS,
} from "../../shared/types";
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
  RefreshCcw,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  FileCheck2,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_FLOW: Record<TicketStatus, TicketStatus[]> = {
  pending_assign: [],
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

const ADMIN_OPERATORS = ["管理员", "调度员A", "调度员B"];

function ReworkStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
    slate: "bg-slate-50 text-slate-600 border-slate-200",
  };
  const color = (REWORK_STATUS_COLORS as any)[status] ?? "slate";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        colorMap[color]
      )}
    >
      {REWORK_STATUS_LABELS[status as keyof typeof REWORK_STATUS_LABELS] ?? status}
    </span>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentOperator, showToast } = useAppStore();
  const ticketId = Number(id);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [undoSnapshot, setUndoSnapshot] = useState<OperationSnapshot | null>(null);
  const [reworks, setReworks] = useState<ReworkApplication[]>([]);
  const [pendingRework, setPendingRework] = useState<ReworkApplication | null>(null);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [availability, setAvailability] = useState<TechnicianAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyReason, setApplyReason] = useState("");

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [reviewComment, setReviewComment] = useState("");

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
      setReworks(d1.data.reworks ?? []);
      setPendingRework(d1.data.pendingRework ?? null);
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
  const canUndo = undoSnapshot !== null;
  const canAssign = !isClosed && ticket?.status === "pending_assign";
  const isAdmin = ADMIN_OPERATORS.includes(currentOperator);

  const isTicketCreator = (() => {
    const createLog = auditLogs.find((a) => a.action === "create");
    return createLog?.operator === currentOperator;
  })();

  const canApplyRework = isClosed && !pendingRework && (isTicketCreator || isAdmin);

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

  const handleApplyRework = async () => {
    const reason = applyReason.trim();
    if (reason.length < 5) {
      showToast("复核原因至少需要5个字符", "error");
      return;
    }
    setBusy("rework-apply");
    try {
      const res = await fetch(`/api/tickets/${ticketId}/rework/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, operator: currentOperator }),
      });
      const j = await res.json();
      if (res.ok) {
        showToast("复核申请已提交，等待审批", "success");
        setShowApplyModal(false);
        setApplyReason("");
        load();
      } else {
        showToast("申请失败：" + (j.error ?? "未知错误"), "error");
      }
    } finally {
      setBusy(null);
    }
  };

  const handleWithdrawRework = async () => {
    if (!pendingRework) return;
    if (!confirm("确定撤回复核申请？")) return;
    setBusy("rework-withdraw");
    try {
      const res = await fetch(`/api/tickets/${ticketId}/rework/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reworkId: pendingRework.id, operator: currentOperator }),
      });
      const j = await res.json();
      if (res.ok) {
        showToast("已撤回复核申请", "success");
        load();
      } else {
        showToast("撤回失败：" + (j.error ?? "未知错误"), "error");
      }
    } finally {
      setBusy(null);
    }
  };

  const openReviewModal = (action: "approve" | "reject") => {
    setReviewAction(action);
    setReviewComment("");
    setShowReviewModal(true);
  };

  const handleReviewRework = async () => {
    if (!pendingRework) return;
    const comment = reviewComment.trim();
    if (comment.length < 2) {
      showToast("审批意见至少需要2个字符", "error");
      return;
    }
    setBusy("rework-review");
    try {
      const res = await fetch(`/api/tickets/${ticketId}/rework/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reworkId: pendingRework.id,
          approved: reviewAction === "approve",
          comment,
          operator: currentOperator,
        }),
      });
      const j = await res.json();
      if (res.ok) {
        showToast(
          reviewAction === "approve" ? "复核通过，工单已回到待验收" : "复核已拒绝",
          "success"
        );
        setShowReviewModal(false);
        setReviewComment("");
        load();
      } else {
        showToast("审批失败：" + (j.error ?? "未知错误"), "error");
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
  const canReviewRework = isAdmin && pendingRework !== null;
  const canWithdrawRework =
    pendingRework !== null && pendingRework.applicant === currentOperator;

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

      {/* closed 态顶部提示 + 返工申请状态 */}
      {isClosed && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="flex-1 space-y-2">
            <div className="font-medium">工单已关闭</div>
            <div className="text-emerald-700/90">
              关闭后<span className="font-semibold">不能改派或直接变更状态</span>，可使用「撤销」按钮
              回退到关闭前状态（「{undoSnapshot ? STATUS_LABELS[undoSnapshot.previousStatus as TicketStatus] : '—'}」），
              或通过<span className="font-semibold">「申请复核」</span>提交返工审批，并留下审计记录。
            </div>
            {pendingRework && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-white/70 p-2 border border-amber-200">
                <Eye className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-amber-700">当前有待审批的复核申请：</span>
                <ReworkStatusBadge status={pendingRework.status} />
                <span className="text-xs text-amber-600">
                  申请人：{pendingRework.applicant} · {new Date(pendingRework.createdAt).toLocaleString("zh-CN")}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rework History Card */}
      {reworks.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <RefreshCcw className="h-4 w-4" />
            复核/返工记录 ({reworks.length})
          </h3>
          <div className="space-y-3">
            {reworks.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-slate-100 bg-slate-50/50 p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ReworkStatusBadge status={r.status} />
                    <span className="text-xs text-slate-500">申请 #{r.id}</span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(r.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex gap-2">
                    <span className="text-slate-500 shrink-0 w-16">申请人：</span>
                    <span className="text-slate-700">{r.applicant}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-slate-500 shrink-0 w-16">申请原因：</span>
                    <span className="text-slate-700">{r.reason}</span>
                  </div>
                  {r.reviewer && (
                    <>
                      <div className="flex gap-2">
                        <span className="text-slate-500 shrink-0 w-16">审批人：</span>
                        <span className="text-slate-700">{r.reviewer}</span>
                      </div>
                      {r.reviewComment && (
                        <div className="flex gap-2">
                          <span className="text-slate-500 shrink-0 w-16">审批意见：</span>
                          <span className="text-slate-700">{r.reviewComment}</span>
                        </div>
                      )}
                      {r.reviewedAt && (
                        <div className="flex gap-2">
                          <span className="text-slate-500 shrink-0 w-16">审批时间：</span>
                          <span className="text-slate-700">
                            {new Date(r.reviewedAt).toLocaleString("zh-CN")}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
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

            {/* 返工申请操作区 */}
            {isClosed && (
              <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-700">
                  <FileCheck2 className="h-3.5 w-3.5" />
                  返工复核申请
                </div>
                <div className="flex flex-wrap gap-2">
                  {canApplyRework && (
                    <button
                      disabled={busy !== null}
                      onClick={() => setShowApplyModal(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm transition hover:bg-indigo-50 disabled:opacity-50"
                    >
                      {busy === "rework-apply" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                      申请复核
                    </button>
                  )}
                  {canWithdrawRework && (
                    <button
                      disabled={busy !== null}
                      onClick={handleWithdrawRework}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busy === "rework-withdraw" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      撤回申请
                    </button>
                  )}
                  {canReviewRework && (
                    <>
                      <button
                        disabled={busy !== null}
                        onClick={() => openReviewModal("approve")}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <ThumbsUp className="h-4 w-4" />
                        通过复核
                      </button>
                      <button
                        disabled={busy !== null}
                        onClick={() => openReviewModal("reject")}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                      >
                        <ThumbsDown className="h-4 w-4" />
                        拒绝申请
                      </button>
                    </>
                  )}
                  {!canApplyRework && !canWithdrawRework && !canReviewRework && (
                    <span className="text-xs text-slate-500">
                      {pendingRework
                        ? "该工单有待审批的复核申请"
                        : isClosed
                        ? "只有工单创建人或管理员可以申请复核"
                        : ""}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
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

            <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 leading-relaxed border border-slate-100">
              <div className="font-medium text-slate-600 mb-1">操作说明</div>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>状态推进：<span className="font-mono">待派单 → 派单 → 处理中 → 待验收 → 关闭</span></li>
                <li>可撤销最近一次派单或状态变更（<span className="text-orange-600 font-medium">包含关闭后撤销</span>），撤销操作本身会写入审计日志且不可再撤销</li>
                <li>已关闭工单<span className="text-indigo-600 font-medium">可申请复核</span>（仅创建人或管理员），审批通过后回到「待验收」状态</li>
                <li>同一工单不能同时有多个待审批的复核申请，审批前可撤回自己的申请</li>
                <li>已关闭工单<span className="text-red-600 font-medium">不能改派或直接变更状态</span>，需先撤销关闭或复核通过</li>
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
                <div className="mt-1 text-slate-500">如需重新派单，请先撤销关闭或申请复核</div>
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
                          : a.action === "status_change" || a.action === "rework_status_rollback"
                          ? "bg-emerald-500 ring-2 ring-emerald-200"
                          : a.action === "assign"
                          ? "bg-violet-500 ring-2 ring-violet-200"
                          : a.action === "rework_apply"
                          ? "bg-indigo-500 ring-2 ring-indigo-200"
                          : a.action === "rework_approve"
                          ? "bg-teal-500 ring-2 ring-teal-200"
                          : a.action === "rework_reject"
                          ? "bg-rose-500 ring-2 ring-rose-200"
                          : a.action === "rework_withdraw"
                          ? "bg-slate-500 ring-2 ring-slate-200"
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

      {/* Apply Rework Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-800 flex items-center gap-2">
              <RefreshCcw className="h-5 w-5 text-indigo-600" />
              申请复核（返工）
            </h3>
            <p className="mb-4 text-sm text-slate-600">
              工单 <span className="font-mono font-medium">{ticket.ticketNo}</span>{" "}
              已关闭，请填写复核原因，管理员审批通过后工单将回到「待验收」状态。
            </p>
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                复核原因 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={applyReason}
                onChange={(e) => setApplyReason(e.target.value)}
                rows={4}
                placeholder="请详细说明需要返工的原因（至少5个字符）…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none resize-none"
              />
              <div className="mt-1 text-[11px] text-slate-400 text-right">
                {applyReason.length}/500
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowApplyModal(false);
                  setApplyReason("");
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                disabled={applyReason.trim().length < 5 || busy === "rework-apply"}
                onClick={handleApplyRework}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy === "rework-apply" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                提交申请
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Rework Modal */}
      {showReviewModal && pendingRework && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3
              className={cn(
                "mb-4 text-lg font-semibold flex items-center gap-2",
                reviewAction === "approve" ? "text-emerald-700" : "text-red-700"
              )}
            >
              {reviewAction === "approve" ? (
                <ThumbsUp className="h-5 w-5" />
              ) : (
                <ThumbsDown className="h-5 w-5" />
              )}
              {reviewAction === "approve" ? "通过复核申请" : "拒绝复核申请"}
            </h3>
            <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-slate-500">申请人</span>
                <span className="font-medium text-slate-700">{pendingRework.applicant}</span>
              </div>
              <div className="mb-1 flex items-start justify-between text-xs gap-2">
                <span className="text-slate-500 shrink-0">申请原因</span>
                <span className="text-slate-700 text-right flex-1">{pendingRework.reason}</span>
              </div>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                审批意见 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={3}
                placeholder={
                  reviewAction === "approve"
                    ? "请填写通过复核的意见（至少2个字符）…"
                    : "请说明拒绝原因（至少2个字符）…"
                }
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none resize-none"
              />
              <div className="mt-1 text-[11px] text-slate-400 text-right">
                {reviewComment.length}/500
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowReviewModal(false);
                  setReviewComment("");
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                disabled={reviewComment.trim().length < 2 || busy === "rework-review"}
                onClick={handleReviewRework}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50",
                  reviewAction === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700"
                )}
              >
                {busy === "rework-review" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : reviewAction === "approve" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                确认{reviewAction === "approve" ? "通过" : "拒绝"}
              </button>
            </div>
          </div>
        </div>
      )}
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
  rework_apply: "申请复核",
  rework_withdraw: "撤回复核",
  rework_approve: "通过复核",
  rework_reject: "拒绝复核",
  rework_status_rollback: "状态回退(返工)",
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
