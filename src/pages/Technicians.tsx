import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useAppStore } from '@/store/useAppStore';
import type { Skill, Technician, Vacation } from '@shared/types';
import { SKILL_LABELS } from '@shared/types';
import SkillTag from '@/components/SkillTag';
import { Plus, Trash2, Edit2, Calendar as CalendarIcon, Wrench, Save, X } from 'lucide-react';

const ALL_SKILLS: Skill[] = [
  'air_conditioner',
  'refrigerator',
  'washing_machine',
  'computer',
  'network',
  'plumbing',
  'electrical',
  'elevator',
];

export default function Technicians() {
  const { operator, triggerReload } = useAppStore();
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const [vacationFor, setVacationFor] = useState<Technician | null>(null);
  const [form, setForm] = useState({
    name: '',
    employeeId: '',
    skills: [] as Skill[],
    dailyLimit: 3,
  });
  const [vacationForm, setVacationForm] = useState({
    startDate: '',
    endDate: '',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  function loadData() {
    setLoading(true);
    api.technicians
      .list()
      .then(setTechnicians)
      .catch((err) => alert(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', employeeId: '', skills: [], dailyLimit: 3 });
    setShowForm(true);
  }

  function openEdit(tech: Technician) {
    setEditing(tech);
    setForm({
      name: tech.name,
      employeeId: tech.employeeId,
      skills: tech.skills,
      dailyLimit: tech.dailyLimit,
    });
    setShowForm(true);
  }

  function toggleSkill(skill: Skill) {
    setForm((f) => {
      if (f.skills.includes(skill)) {
        return { ...f, skills: f.skills.filter((s) => s !== skill) };
      }
      return { ...f, skills: [...f.skills, skill] };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.employeeId.trim() || form.skills.length === 0) {
      alert('请完整填写信息并至少选择一项技能');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await api.technicians.update(editing.id, {
          name: form.name,
          skills: form.skills,
          dailyLimit: form.dailyLimit,
          operator,
        });
      } else {
        await api.technicians.create({ ...form, operator });
      }
      setShowForm(false);
      triggerReload();
      loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(tech: Technician) {
    if (!confirm(`确认删除技师「${tech.name}」？`)) return;
    try {
      await api.technicians.remove(tech.id, operator);
      triggerReload();
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  function openVacation(tech: Technician) {
    setVacationFor(tech);
    setVacationForm({ startDate: '', endDate: '', reason: '' });
  }

  async function handleVacationSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vacationFor || !vacationForm.startDate || !vacationForm.endDate) return;
    setSubmitting(true);
    try {
      await api.technicians.createVacation(vacationFor.id, { ...vacationForm, operator });
      setVacationFor(null);
      triggerReload();
      loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">技师管理</h2>
          <p className="text-sm text-slate-500">维护技师信息、技能和休假安排</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增技师
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500">加载中...</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {technicians.map((tech) => (
            <div
              key={tech.id}
              className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                      {tech.name[0]}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{tech.name}</h3>
                      <p className="text-xs text-slate-500">工号：{tech.employeeId}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(tech)}
                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="编辑"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(tech)}
                    className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="mb-3">
                <div className="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
                  <Wrench className="w-3 h-3" />
                  技能
                </div>
                <div className="flex flex-wrap gap-1">
                  {tech.skills.map((s) => (
                    <SkillTag key={s} skill={s} />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>每日接单上限：{tech.dailyLimit} 单</span>
                <button
                  onClick={() => openVacation(tech)}
                  className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <CalendarIcon className="w-3 h-3" />
                  设休假
                </button>
              </div>
            </div>
          ))}

          {technicians.length === 0 && (
            <div className="col-span-3 text-center py-20 text-slate-400">
              <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>暂无技师，点击右上角添加</p>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900">
                {editing ? '编辑技师' : '新增技师'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  姓名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  工号 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  disabled={submitting || !!editing}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  每日接单上限 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.dailyLimit}
                  onChange={(e) =>
                    setForm({ ...form, dailyLimit: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  技能 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_SKILLS.map((skill) => {
                    const selected = form.skills.includes(skill);
                    return (
                      <label
                        key={skill}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                          selected
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-200 hover:border-slate-300 text-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSkill(skill)}
                          className="sr-only"
                        />
                        <span>{SKILL_LABELS[skill]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {submitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {vacationFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900">设置休假 - {vacationFor.name}</h3>
              <button
                onClick={() => setVacationFor(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleVacationSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开始日期</label>
                  <input
                    type="date"
                    value={vacationForm.startDate}
                    onChange={(e) =>
                      setVacationForm({ ...vacationForm, startDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">结束日期</label>
                  <input
                    type="date"
                    value={vacationForm.endDate}
                    onChange={(e) =>
                      setVacationForm({ ...vacationForm, endDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    disabled={submitting}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">休假原因</label>
                <input
                  type="text"
                  value={vacationForm.reason}
                  onChange={(e) =>
                    setVacationForm({ ...vacationForm, reason: e.target.value })
                  }
                  placeholder="可选"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setVacationFor(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  确定
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
