import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { AuditLog } from '@shared/types';
import { ScrollText, FileText, Wrench, ArrowRightLeft, Undo2, MessageSquare } from 'lucide-react';

const actionIcons: Record<string, typeof FileText> = {
  create: FileText,
  assign: Wrench,
  status_change: ArrowRightLeft,
  undo: Undo2,
  note_add: MessageSquare,
  technician_create: Wrench,
  technician_update: Wrench,
  technician_delete: Wrench,
  vacation_create: Wrench,
};

const actionLabels: Record<string, string> = {
  create: '创建工单',
  assign: '派单',
  status_change: '状态变更',
  undo: '撤销操作',
  note_add: '添加备注',
  technician_create: '新增技师',
  technician_update: '更新技师',
  technician_delete: '删除技师',
  vacation_create: '设置休假',
};

const actionColors: Record<string, string> = {
  create: 'bg-blue-100 text-blue-700',
  assign: 'bg-purple-100 text-purple-700',
  status_change: 'bg-amber-100 text-amber-700',
  undo: 'bg-orange-100 text-orange-700',
  note_add: 'bg-green-100 text-green-700',
  technician_create: 'bg-teal-100 text-teal-700',
  technician_update: 'bg-teal-100 text-teal-700',
  technician_delete: 'bg-red-100 text-red-700',
  vacation_create: 'bg-rose-100 text-rose-700',
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.audit
      .list()
      .then(setLogs)
      .catch((err) => alert(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">审计日志</h2>
        <p className="text-sm text-slate-500">查看所有操作记录，包括创建、派单、状态变更、撤销等</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
        {loading ? (
          <div className="text-center py-20 text-slate-500">加载中...</div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[calc(100vh-200px)] overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>暂无操作记录</p>
              </div>
            ) : (
              logs.map((log) => {
                const Icon = actionIcons[log.action] || FileText;
                return (
                  <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${actionColors[log.action] || 'bg-slate-100 text-slate-700'}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 text-sm">
                              {log.operator}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${actionColors[log.action] || 'bg-slate-100 text-slate-700'}`}
                            >
                              {actionLabels[log.action] || log.action}
                            </span>
                            {log.undoOfId !== undefined && log.undoOfId !== null && (
                              <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                                撤销操作
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400">
                            {new Date(log.createdAt).toLocaleString('zh-CN')}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">{log.description}</p>
                        {log.ticketId !== undefined && log.ticketId !== null && (
                          <div className="text-xs text-slate-400 mt-1">
                            工单 ID: #{log.ticketId}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
