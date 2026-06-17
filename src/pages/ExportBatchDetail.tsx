import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  ExportBatch,
  ExportBatchStatus,
  TicketSnapshot,
  ExportVerificationDetail,
  VerificationStatus,
} from "../../shared/types";
import {
  EXPORT_BATCH_STATUS_COLORS,
  EXPORT_BATCH_STATUS_LABELS,
  STATUS_LABELS,
  URGENCY_LABELS,
  VERIFICATION_STATUS_COLORS,
  VERIFICATION_STATUS_LABELS,
} from "../../shared/types";
import { useAppStore } from "@/store";
import {
  ArrowLeft,
  Download,
  RefreshCw,
  XCircle,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertCircle,
  XOctagon,
  FileText,
  User,
  Calendar,
  AlertTriangle,
  Hash,
  ShieldCheck,
  FileCheck2,
  Link2,
  Copy,
} from "lucide-react";
import clsx from "clsx";

export default function ExportBatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentOperator, showToast } = useAppStore();
  const [batch, setBatch] = useState<ExportBatch | null>(null);
  const [snapshots, setSnapshots] = useState<TicketSnapshot[]>([]);
  const [verification, setVerification] = useState<ExportVerificationDetail | null>(null);
  const [retryChain, setRetryChain] = useState<ExportBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!id) return;
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        fetch(`/api/export/batches/${id}?operator=${encodeURIComponent(currentOperator)}`),
        fetch(`/api/export/batches/${id}/snapshots?operator=${encodeURIComponent(currentOperator)}`),
        fetch(`/api/export/batches/${id}/verification?operator=${encodeURIComponent(currentOperator)}`).catch(() => null),
        fetch(`/api/export/batches/${id}/retry-chain?operator=${encodeURIComponent(currentOperator)}`).catch(() => null),
      ]);
      const j1 = await r1.json();
      const j2 = await r2.json();
      if (!r1.ok) throw new Error(j1.error ?? "加载失败");
      setBatch(j1.data);
      setSnapshots(j2.data ?? []);
      if (r3 && r3.ok) {
        const j3 = await r3.json();
        setVerification(j3.data);
      }
      if (r4 && r4.ok) {
        const j4 = await r4.json();
        setRetryChain(j4.data ?? []);
      }
    } catch (e: any) {
      showToast(e.message ?? "加载失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(() => {
      if (batch && (batch.status === "pending" || batch.status === "processing")) {
        loadData();
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [id, currentOperator]);

  const cancelBatch = async () => {
    if (!batch || !confirm("确认取消此导出批次？")) return;
    try {
      const res = await fetch(`/api/export/batches/${batch.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator: currentOperator }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "取消失败");
      showToast("已取消", "success");
      await loadData();
    } catch (e: any) {
      showToast(e.message ?? "取消失败", "error");
    }
  };

  const retryBatch = async () => {
    if (!batch) return;
    try {
      const res = await fetch(`/api/export/batches/${batch.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator: currentOperator }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "重试失败");
      showToast(`已重新创建批次 ${json.data.batchNo}`, "success");
      navigate(`/export/batches/${json.data.id}`);
    } catch (e: any) {
      showToast(e.message ?? "重试失败", "error");
    }
  };

  const downloadBatch = async () => {
    if (!batch) return;
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

  const reVerify = async () => {
    if (!batch) return;
    try {
      const res = await fetch(`/api/export/batches/${batch.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator: currentOperator }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "验真失败");
      setVerification(json.data.verification);
      setBatch(json.data.batch);
      showToast("验真完成", "success");
    } catch (e: any) {
      showToast(e.message ?? "验真失败", "error");
    }
  };

  const copySha = async (sha: string) => {
    try {
      await navigator.clipboard.writeText(sha);
      showToast("已复制到剪贴板", "success");
    } catch {
      showToast("复制失败", "error");
    }
  };

  if (loading && !batch) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-slate-400" />
        <p className="text-slate-600">导出批次不存在</p>
        <button
          onClick={() => navigate("/export")}
          className="mt-4 inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" /> 返回导出中心
        </button>
      </div>
    );
  }

  const diffCount = snapshots.filter((s) => s.hasStatusDiff || s.hasTechnicianDiff).length;
  const isCurrentInChain = (b: ExportBatch) => b.id === batch.id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/export")}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> 返回导出中心
        </button>
        <div className="flex items-center gap-2">
          {batch.status === "completed" && batch.verificationStatus === "verified" && (
            <button
              onClick={downloadBatch}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <Download className="h-4 w-4" /> 下载 CSV
            </button>
          )}
          {batch.status === "completed" && (
            <button
              onClick={reVerify}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ShieldCheck className="h-4 w-4" /> 重新验真
            </button>
          )}
          {batch.status === "pending" && (
            <button
              onClick={cancelBatch}
              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <XCircle className="h-4 w-4" /> 取消批次
            </button>
          )}
          {(batch.status === "failed" || batch.status === "cancelled") && (
            <button
              onClick={retryBatch}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              <RotateCcw className="h-4 w-4" /> 重试导出
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-slate-800">{batch.batchNo}</h2>
                  <StatusBadge status={batch.status} />
                  {batch.status === "completed" && batch.verificationStatus && (
                    <VerificationBadge status={batch.verificationStatus as VerificationStatus} />
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500">{batch.filterSummary}</p>
                {batch.recoveredAt && (
                  <p className="mt-1 text-xs text-amber-600">
                    该任务经过服务重启恢复（{new Date(batch.recoveredAt).toLocaleString("zh-CN")}）
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-4 gap-4">
              <InfoItem icon={<User className="h-4 w-4" />} label="创建人" value={batch.operator} />
              <InfoItem
                icon={<Calendar className="h-4 w-4" />}
                label="创建时间"
                value={new Date(batch.createdAt).toLocaleString("zh-CN")}
              />
              <InfoItem
                icon={<Hash className="h-4 w-4" />}
                label="命中工单"
                value={`${batch.totalCount} 条`}
              />
              <InfoItem
                icon={<FileText className="h-4 w-4" />}
                label="已导出"
                value={`${batch.exportedCount} 条`}
              />
            </div>

            {batch.startedAt && (
              <div className="mt-4 grid grid-cols-3 gap-4 text-xs text-slate-500">
                <div>
                  开始处理：
                  <span className="text-slate-700">{new Date(batch.startedAt).toLocaleString("zh-CN")}</span>
                </div>
                {batch.completedAt && (
                  <div>
                    完成时间：
                    <span className="text-slate-700">
                      {new Date(batch.completedAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                )}
                {batch.cancelledAt && (
                  <div>
                    取消时间：
                    <span className="text-slate-700">
                      {new Date(batch.cancelledAt).toLocaleString("zh-CN")}（{batch.cancelledBy}）
                    </span>
                  </div>
                )}
              </div>
            )}

            {batch.failedReason && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500" />
                  <div>
                    <div className="text-xs font-medium text-red-700">失败原因</div>
                    <div className="mt-0.5 text-sm text-red-600">{batch.failedReason}</div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {verification && batch.status !== "pending" && batch.status !== "processing" && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <FileCheck2 className="h-4 w-4" /> 验真详情
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">快照条数</span>
                  <span className="font-medium text-slate-800">{verification.snapshotCount}</span>
                </div>
                <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">文件实际行数</span>
                  <span className={clsx("font-medium", verification.countMatch ? "text-emerald-700" : "text-red-600")}>
                    {verification.fileRowCount}
                  </span>
                </div>
                <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">文件大小</span>
                  <span className="font-medium text-slate-800">
                    {verification.fileSizeBytes < 1024
                      ? `${verification.fileSizeBytes} B`
                      : `${(verification.fileSizeBytes / 1024).toFixed(2)} KB`}
                  </span>
                </div>
                <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">条数匹配</span>
                  <span className={clsx("font-medium", verification.countMatch ? "text-emerald-700" : "text-red-600")}>
                    {verification.countMatch ? "是" : "否"}
                  </span>
                </div>
                <div className="col-span-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">文件 SHA256</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-800">
                      {verification.fileSha256.slice(0, 32)}...
                    </span>
                    <button
                      onClick={() => copySha(verification.fileSha256)}
                      className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700"
                      title="复制完整哈希"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">文件存在</span>
                  <span className={clsx("font-medium", verification.fileExists ? "text-emerald-700" : "text-red-600")}>
                    {verification.fileExists ? "是" : "否"}
                  </span>
                </div>
                {verification.verifiedAt && (
                  <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-slate-500">验真时间</span>
                    <span className="font-medium text-slate-800">
                      {new Date(verification.verifiedAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                )}
              </div>
              {verification.mismatchReason && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {verification.mismatchReason}
                </div>
              )}
            </section>
          )}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <FileText className="h-3 w-3" /> 导出快照明细
                <span className="text-slate-400">（共 {snapshots.length} 条）</span>
              </div>
              {diffCount > 0 && (
                <div className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  {diffCount} 条数据与当前状态有差异
                </div>
              )}
            </div>
            <div className="max-h-[600px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white text-slate-500 shadow-sm z-10">
                  <tr>
                    <th className="px-4 py-2 text-left">工单编号</th>
                    <th className="px-4 py-2 text-left">标题</th>
                    <th className="px-4 py-2 text-left">快照状态</th>
                    <th className="px-4 py-2 text-left">快照技师</th>
                    <th className="px-4 py-2 text-left">紧急程度</th>
                    <th className="px-4 py-2 text-left">差异标记</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {snapshots.map((s) => (
                    <tr key={s.ticketId} className={clsx(s.hasStatusDiff || s.hasTechnicianDiff ? "bg-amber-50/30" : "hover:bg-slate-50/60")}>
                      <td className="px-4 py-2 font-mono text-slate-700">{s.ticketNo}</td>
                      <td className="px-4 py-2 text-slate-800 max-w-xs truncate" title={s.title}>
                        {s.title}
                      </td>
                      <td className="px-4 py-2">
                        <div>
                          <span className="text-slate-700">{STATUS_LABELS[s.status]}</span>
                          {s.hasStatusDiff && s.currentStatus && (
                            <div className="text-[10px] text-amber-600 mt-0.5">
                              → 当前：{STATUS_LABELS[s.currentStatus]}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div>
                          <span className="text-slate-600">{s.technicianName ?? "未派单"}</span>
                          {s.hasTechnicianDiff && (
                            <div className="text-[10px] text-amber-600 mt-0.5">
                              → 当前：{s.currentTechnicianName ?? "未派单"}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{URGENCY_LABELS[s.urgency]}</td>
                      <td className="px-4 py-2">
                        {(s.hasStatusDiff || s.hasTechnicianDiff) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            有变更
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                            无变更
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <FileText className="h-4 w-4" /> 筛选条件明细
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">开始日期</span>
                <span className="text-slate-700">{batch.filters.startDate ?? "不限"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">结束日期</span>
                <span className="text-slate-700">{batch.filters.endDate ?? "不限"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">技师ID</span>
                <span className="text-slate-700">{batch.filters.technicianId ?? "不限"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">工单状态</span>
                <span className="text-slate-700">
                  {batch.filters.status ? STATUS_LABELS[batch.filters.status] : "不限"}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Hash className="h-4 w-4" /> 命中工单 ID
            </h3>
            <div className="max-h-[200px] overflow-auto">
              <div className="flex flex-wrap gap-1">
                {batch.ticketIds.map((tid) => (
                  <span
                    key={tid}
                    className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700"
                  >
                    #{tid}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {retryChain.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Link2 className="h-4 w-4" /> 重试链路
              </h3>
              <div className="space-y-2">
                {retryChain.map((b, idx) => (
                  <div
                    key={b.id}
                    className={clsx(
                      "rounded-lg p-2 text-xs",
                      isCurrentInChain(b)
                        ? "bg-emerald-50 border border-emerald-200"
                        : "bg-slate-50 border border-slate-200"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={clsx(
                          "font-mono",
                          isCurrentInChain(b) ? "text-emerald-800 font-semibold" : "text-slate-700"
                        )}
                      >
                        {b.batchNo}
                        {isCurrentInChain(b) && " ← 当前"}
                      </span>
                      <StatusBadge status={b.status} />
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                      <span>{b.operator}</span>
                      <span>{new Date(b.createdAt).toLocaleDateString("zh-CN")}</span>
                    </div>
                    {b.failedReason && (
                      <div className="mt-1 text-[11px] text-red-500 truncate" title={b.failedReason}>
                        {b.failedReason}
                      </div>
                    )}
                    {idx < retryChain.length - 1 && (
                      <div className="my-1 flex justify-center">
                        <RotateCcw className="h-3 w-3 text-slate-400" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">说明</h3>
            <ul className="space-y-1 text-xs text-slate-500 list-disc pl-4">
              <li>快照数据为导出时的实时状态，不受后续变更影响</li>
              <li>黄色高亮行表示该工单当前状态或技师已变更</li>
              <li>下载的 CSV 文件始终以快照数据为准</li>
              <li>批次记录及文件持久化保存，服务重启后仍可访问</li>
              <li>必须通过验真（条数+SHA256）才能下载文件</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function InfoItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-800">{value}</div>
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
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        colorMap[color] ?? "bg-slate-100 text-slate-700"
      )}
    >
      <Icon className={clsx("h-3.5 w-3.5", status === "processing" && "animate-spin")} />
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
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        colorMap[color] ?? "bg-slate-100 text-slate-700"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
