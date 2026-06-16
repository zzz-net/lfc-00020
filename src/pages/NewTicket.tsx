import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { useAppStore } from '@/store/useAppStore';
import type { Urgency } from '@shared/types';
import { URGENCY_LABELS } from '@shared/types';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';

export default function NewTicket() {
  const navigate = useNavigate();
  const { operator } = useAppStore();
  const [form, setForm] = useState({
    title: '',
    location: '',
    description: '',
    contactName: '',
    contactPhone: '',
    urgency: 'medium' as Urgency,
    expectedDate: new Date().toISOString().slice(0, 10),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as string]) {
      setErrors((e) => {
        const n = { ...e };
        delete n[key as string];
        return n;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = '请填写报修标题';
    if (!form.location.trim()) errs.location = '请填写地点';
    if (!form.description.trim()) errs.description = '请填写故障描述';
    if (!form.contactName.trim()) errs.contactName = '请填写联系人姓名';
    if (!form.contactPhone.trim()) {
      errs.contactPhone = '请填写联系电话';
    } else if (!/^1[3-9]\d{9}$/.test(form.contactPhone)) {
      errs.contactPhone = '手机号格式不正确';
    }
    if (!form.expectedDate) errs.expectedDate = '请选择期望完成日期';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const ticket = await api.tickets.create({ ...form, operator });
      navigate(`/tickets/${ticket.id}`);
    } catch (err: any) {
      alert(err.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-sm text-slate-600 hover:text-slate-900 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        返回
      </button>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">新建报修工单</h2>
          <p className="text-sm text-slate-500 mt-0.5">请填写报修信息，标 * 为必填项</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              报修标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="例如：3楼空调不制冷"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all ${
                errors.title ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                地点 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => update('location', e.target.value)}
                placeholder="例如：研发中心3楼301"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all ${
                  errors.location ? 'border-red-400' : 'border-slate-300'
                }`}
              />
              {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                紧急程度 <span className="text-red-500">*</span>
              </label>
              <select
                value={form.urgency}
                onChange={(e) => update('urgency', e.target.value as Urgency)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all bg-white"
              >
                {(Object.keys(URGENCY_LABELS) as Urgency[]).map((u) => (
                  <option key={u} value={u}>
                    {URGENCY_LABELS[u]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              故障描述 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              rows={4}
              placeholder="请详细描述故障现象..."
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all resize-none ${
                errors.description ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {errors.description && (
              <p className="text-red-500 text-xs mt-1">{errors.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                联系人姓名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.contactName}
                onChange={(e) => update('contactName', e.target.value)}
                placeholder="例如：陈主管"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all ${
                  errors.contactName ? 'border-red-400' : 'border-slate-300'
                }`}
              />
              {errors.contactName && (
                <p className="text-red-500 text-xs mt-1">{errors.contactName}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                联系电话 <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={(e) => update('contactPhone', e.target.value)}
                placeholder="11位手机号"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all ${
                  errors.contactPhone ? 'border-red-400' : 'border-slate-300'
                }`}
              />
              {errors.contactPhone && (
                <p className="text-red-500 text-xs mt-1">{errors.contactPhone}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              期望完成日期 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.expectedDate}
              onChange={(e) => update('expectedDate', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all ${
                errors.expectedDate ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {errors.expectedDate && (
              <p className="text-red-500 text-xs mt-1">{errors.expectedDate}</p>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              提示：提交后工单进入「待派单」状态，需指派技师后方可推进处理。
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {submitting ? '提交中...' : '提交工单'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
