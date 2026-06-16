import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { Technician } from '@shared/types';
import { Download, FileText, Calendar } from 'lucide-react';

export default function ExportPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [technicianId, setTechnicianId] = useState<number | ''>('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.technicians.list().then(setTechnicians).catch(() => {});
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const params: { startDate?: string; endDate?: string; technicianId?: number } = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (technicianId !== '') params.technicianId = technicianId;

      const { blob, filename } = await api.export.csv(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">导出中心</h2>
        <p className="text-sm text-slate-500">按条件筛选并导出工单历史数据（CSV 格式）</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 max-w-xl">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          导出设置
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                开始日期
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                结束日期
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">技师筛选</label>
            <select
              value={technicianId}
              onChange={(e) =>
                setTechnicianId(e.target.value ? Number(e.target.value) : '')
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white"
            >
              <option value="">全部技师</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}（{t.employeeId}）
                </option>
              ))}
            </select>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              CSV 文件包含：工单编号、标题、地点、故障描述、联系人、联系电话、紧急程度、期望完成日期、状态、指派技师、技师技能、创建/更新时间等字段。
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              {exporting ? '导出中...' : '导出 CSV 文件'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
