import { useEffect, useState } from "react";
import type { Technician, Skill } from "../../shared/types";
import { SKILL_LABELS } from "../../shared/types";
import { useAppStore } from "@/store";
import { Loader2, Plus, UserCog, Trash2, Calendar, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

const ALL_SKILLS: Skill[] = [
  "air_conditioner",
  "refrigerator",
  "washing_machine",
  "computer",
  "network",
  "plumbing",
  "electrical",
  "elevator",
];

export default function Technicians() {
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const { showToast } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", employeeId: "", skills: [] as Skill[], dailyLimit: 3 });
  const [vacForm, setVacForm] = useState({ techId: 0, startDate: "", endDate: "", reason: "" });
  const [showVacFor, setShowVacFor] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/technicians");
      const j = await r.json();
      setTechs(j.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ name: "", employeeId: "", skills: [], dailyLimit: 3 });
    setEditingId(null);
    setShowForm(false);
  };

  const toggleSkill = (s: Skill) => {
    setForm((f) => f.skills.includes(s)
      ? { ...f, skills: f.skills.filter((x) => x !== s) }
      : { ...f, skills: [...f.skills, s] }
    );
  };

  const saveTech = async () => {
    if (!form.name.trim() || !form.employeeId.trim()) {
      showToast("请填写姓名和工号", "error");
      return;
    }
    setBusy(editingId ? "edit:" + editingId : "new");
    try {
      const url = editingId ? `/api/technicians/${editingId}` : "/api/technicians";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, operator: "系统" }),
      });
      const j = await res.json();
      if (res.ok) {
        showToast(editingId ? "已更新" : "已新增", "success");
        resetForm();
        load();
      } else showToast("失败：" + (j.error ?? ""), "error");
    } finally { setBusy(null); }
  };

  const deleteTech = async (id: number) => {
    if (!confirm("确定删除该技师？相关历史工单不受影响")) return;
    setBusy("del:" + id);
    try {
      const res = await fetch(`/api/technicians/${id}`, { method: "DELETE" });
      const j = await res.json();
      if (res.ok) { showToast("已删除", "success"); load(); }
      else showToast("失败：" + (j.error ?? ""), "error");
    } finally { setBusy(null); }
  };

  const editTech = (t: Technician) => {
    setEditingId(t.id);
    setForm({ name: t.name, employeeId: t.employeeId, skills: [...t.skills], dailyLimit: t.dailyLimit });
    setShowForm(true);
  };

  const saveVacation = async () => {
    if (!vacForm.startDate || !vacForm.endDate) { showToast("请选择日期", "error"); return; }
    setBusy("vac:" + vacForm.techId);
    try {
      const res = await fetch(`/api/technicians/${vacForm.techId}/vacations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vacForm),
      });
      const j = await res.json();
      if (res.ok) { showToast("已设置休假", "success"); setShowVacFor(null); load(); }
      else showToast("失败：" + (j.error ?? ""), "error");
    } finally { setBusy(null); }
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">加载中…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">共 {techs.length} 名技师</div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> 新增技师
        </button>
      </div>

      {showForm && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">
            <UserCog className="mr-2 inline h-4 w-4" />
            {editingId ? "编辑技师" : "新增技师"}
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs text-slate-600">姓名 *</label>
              <input className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">工号 *</label>
              <input className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                disabled={!!editingId} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">每日接单上限</label>
              <input type="number" min={1} max={10} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Math.max(1, Number(e.target.value) || 3) })} />
            </div>
            <div className="col-span-3">
              <label className="mb-1 block text-xs text-slate-600">技能标签</label>
              <div className="flex flex-wrap gap-2">
                {ALL_SKILLS.map((s) => (
                  <button key={s} type="button" onClick={() => toggleSkill(s)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition",
                      form.skills.includes(s)
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    )}>
                    {SKILL_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={resetForm} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">取消</button>
            <button onClick={saveTech} disabled={busy !== null}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
            </button>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-5 py-3 text-left">姓名</th>
              <th className="px-5 py-3 text-left">工号</th>
              <th className="px-5 py-3 text-left">技能</th>
              <th className="px-5 py-3 text-left">日上限</th>
              <th className="px-5 py-3 text-left">创建时间</th>
              <th className="px-5 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {techs.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-3 font-medium text-slate-800">{t.name}</td>
                <td className="px-5 py-3 font-mono text-xs text-slate-500">{t.employeeId}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {t.skills.map((s) => (
                      <span key={s} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {SKILL_LABELS[s]}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3">{t.dailyLimit} 单</td>
                <td className="px-5 py-3 text-xs text-slate-500">{new Date(t.createdAt).toLocaleDateString("zh-CN")}</td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => editTech(t)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-600">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setShowVacFor(showVacFor === t.id ? null : t.id)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-violet-300 hover:text-violet-600">
                      <Calendar className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteTech(t.id)}
                      disabled={busy === "del:" + t.id}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50">
                      {busy === "del:" + t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {showVacFor === t.id && (
                    <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3 text-left">
                      <div className="mb-2 text-xs font-medium text-violet-700">设置休假（{t.name}）</div>
                      <div className="mb-2 grid grid-cols-3 gap-2">
                        <input type="date" placeholder="开始"
                          value={vacForm.startDate} onChange={(e) => setVacForm({ ...vacForm, techId: t.id, startDate: e.target.value })}
                          className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs" />
                        <input type="date" placeholder="结束"
                          value={vacForm.endDate} onChange={(e) => setVacForm({ ...vacForm, techId: t.id, endDate: e.target.value })}
                          className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs" />
                        <input placeholder="原因（可选）"
                          value={vacForm.reason} onChange={(e) => setVacForm({ ...vacForm, reason: e.target.value })}
                          className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs" />
                      </div>
                      <button onClick={saveVacation}
                        className="rounded bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700">
                        保存休假
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
