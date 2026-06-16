import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store";
import { URGENCY_LABELS, type Urgency } from "../../shared/types";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const URGENCY_ORDER: Urgency[] = ["low", "medium", "high", "critical"];

export default function NewTicket() {
  const navigate = useNavigate();
  const { currentOperator, showToast } = useAppStore();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    location: "",
    description: "",
    contactName: "",
    contactPhone: "",
    urgency: "medium" as Urgency,
    expectedDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
  });
  const [errs, setErrs] = useState<Record<string, string>>({});

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "请填写报修标题";
    if (!form.location.trim()) e.location = "请填写地点";
    if (!form.description.trim()) e.description = "请填写故障描述";
    if (!form.contactName.trim()) e.contactName = "请填写联系人";
    if (!/^\d{6,}$/.test(form.contactPhone)) e.contactPhone = "请填写有效联系电话";
    if (!form.expectedDate) e.expectedDate = "请选择期望日期";
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, operator: currentOperator }),
      });
      const j = await res.json();
      if (res.ok) {
        showToast("工单创建成功", "success");
        navigate(`/tickets/${j.data.id}`);
      } else {
        showToast("创建失败：" + (j.error ?? ""), "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-400 focus:bg-white focus:outline-none";
  const label = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <h2 className="text-xl font-semibold text-slate-800">新建工单</h2>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="grid grid-cols-2 gap-5">
          <div className="col-span-2">
            <label className={label}>报修标题 <span className="text-red-500">*</span></label>
            <input className={input} value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="如：3楼空调不制冷" />
            {errs.title && <p className="mt-1 text-xs text-red-500">{errs.title}</p>}
          </div>
          <div>
            <label className={label}>地点 <span className="text-red-500">*</span></label>
            <input className={input} value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="如：研发中心3楼301" />
            {errs.location && <p className="mt-1 text-xs text-red-500">{errs.location}</p>}
          </div>
          <div>
            <label className={label}>期望完成日期 <span className="text-red-500">*</span></label>
            <input type="date" className={input} value={form.expectedDate} onChange={(e) => update("expectedDate", e.target.value)} />
            {errs.expectedDate && <p className="mt-1 text-xs text-red-500">{errs.expectedDate}</p>}
          </div>
          <div className="col-span-2">
            <label className={label}>故障描述 <span className="text-red-500">*</span></label>
            <textarea className={cn(input, "h-24 resize-none")} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="请详细描述故障现象..." />
            {errs.description && <p className="mt-1 text-xs text-red-500">{errs.description}</p>}
          </div>
          <div>
            <label className={label}>联系人 <span className="text-red-500">*</span></label>
            <input className={input} value={form.contactName} onChange={(e) => update("contactName", e.target.value)} placeholder="姓名" />
            {errs.contactName && <p className="mt-1 text-xs text-red-500">{errs.contactName}</p>}
          </div>
          <div>
            <label className={label}>联系电话 <span className="text-red-500">*</span></label>
            <input className={input} value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} placeholder="手机号" />
            {errs.contactPhone && <p className="mt-1 text-xs text-red-500">{errs.contactPhone}</p>}
          </div>
          <div className="col-span-2">
            <label className={label}>紧急程度</label>
            <div className="flex gap-2">
              {URGENCY_ORDER.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => update("urgency", u)}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-sm font-medium transition",
                    form.urgency === u
                      ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                  )}
                >
                  {URGENCY_LABELS[u]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:border-slate-300"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            提交工单
          </button>
        </div>
      </section>
    </div>
  );
}
