import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/api/client';
import { useAppStore } from '@/store/useAppStore';
import type {
  AuditLog,
  Note,
  OperationSnapshot,
  TechnicianAvailability,
  Ticket,
  TicketStatus,
} from '@shared/types';
import { STATUS_LABELS } from '@shared/types';
import StatusBadge from '@/components/StatusBadge';
import UrgencyBadge from '@/components/UrgencyBadge';
import SkillTag from '@/components/SkillTag';
import {
  ArrowLeft,
  Undo2,
  Send,
  CheckCircle,
  XCircle,
  MessageSquare,
  Clock,
  User,
  Phone,
  MapPin,
  Calendar,
  FileText,
  AlertTriangle,
  Wrench,
} from 'lucide-react';

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { operator, triggerReload } = useAppStore();
  const ticketId = Number(id);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [undoSnapshot, setUndoSnapshot] = useState<OperationSnapshot | null>(null);
  const [availableTechs, setAvailableTechs] = useState<TechnicianAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showAssignPanel, setShowAssignPanel] = useState(false);

  const canUndo = !!undoSnapshot && ticket?.status !== 'closed';

  function loadData() {
    setLoading(true);
    Promise.all([
      api.tickets.get(ticketId),
      ticket?.status === 'pending_assign' || showAssignPanel
        ? api.tickets.availableTechnicians(ticketId)
        : Promise.resolve([]),
    ])
      .then(([detail, techs]) => {
        setTicket(detail.ticket);
        setNotes(detail.notes);
        setAuditLogs(detail.auditLogs);
        setUndoSnapshot(detail.undoSnapshot);
        if (techs.length > 0) setAvailableTechs(techs);
      })
      .catch((err) => alert(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    if (ticket?.status === 'pending_assign' || showAssignPanel) {
      api.tickets.availableTechnicians(ticketId).then(setAvailableTechs).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.status, showAssignPanel]);

  async function handleAssign(techId: number) {
    if (!confirm('确认将工单派给该技师？')) return;
    try {
      const updated = await api.tickets.assign(ticketId, techId, operator);
      setTicket(updated);
      setShowAssignPanel(false);
      triggerReload();
      loadData();
    } catch (err: any) {
      alert(`派单失败：${err.message}`);
    }
  }

  async function handleChangeStatus(newStatus: TicketStatus, confirmText: string) {
    if (!confirm(confirmText)) return;
    try {
      const updated = await api.tickets.changeStatus(ticketId, newStatus, operator);
      setTicket(updated);
      triggerReload();
      loadData();
    } catch (err: any) {
      alert(`操作失败：${err.message}`);
    }
  }

  async function handleUndo() {
    if (!confirm('确认撤销最近一次操作？撤销后不可恢复。')) return;
    try {
      const updated = await api.tickets.undo(ticketId, operator);
      setTicket(updated);
      setUndoSnapshot(null);
      triggerReload();
      loadData();
    } catch (err: any) {
      alert(`撤销失败：${err.message}`);
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSubmitting(true);
    try {
      const note = await api.tickets.addNote(ticketId, newNote.trim(), operator);
      setNotes((prev) => [note, ...prev]);
      setNewNote('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !ticket) {
    return (
      <div className="p-6">
        <div className="text-center py-20 text-slate-500">加载中...</div>
      </div>
    );
  }

  const isClosed = ticket.status === 'closed';
  const isPendingAssign = ticket.status === 'pending_assign';
  const isInProgress = ticket.status === 'in_progress';
  const isPendingVerify = ticket.status === 'pending_verify';

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          返回看板
        </button>
        {canUndo && (
          <button
            onClick={handleUndo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
          >
            <Undo2 className="w-4 h-4" />
            撤销最近操作
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-mono text-slate-500">{ticket.ticketNo}</span>
                  <StatusBadge status={ticket.status} />
                  <UrgencyBadge urgency={ticket.urgency} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">{ticket.title}</h2>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>{ticket.location}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>期望完成：{ticket.expectedDate}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <User className="w-4 h-4 text-slate-400" />
                <span>联系人：{ticket.contactName}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="w-4 h-4 text-slate-400" />
                <span>{ticket.contactPhone}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Wrench className="w-4 h-4 text-slate-400" />
                <span>当前技师：{ticket.technicianName || '未指派'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>创建于：{new Date(ticket.createdAt).toLocaleString('zh-CN')}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-sm font-medium text-slate-700 mb-2">故障描述</h4>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{ticket.description}</p>
            </div>
          </div>

          {isPendingAssign && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Send className="w-5 h-5 text-blue-600" />
                  选择技师派单
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                系统自动匹配可用技师，绿色表示可派单，红色表示存在问题。
              </p>
              <div className="grid grid-cols-1 gap-3">
                {availableTechs.map((item) => (
                  <div
                    key={item.technician.id}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      item.available
                        ? 'border-green-300 bg-green-50/50'
                        : 'border-red-200 bg-red-50/30 opacity-80'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          <span>{item.technician.name}</span>
                          <span className="text-xs text-slate-500 font-normal">
                            工号 {item.technician.employeeId}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2 mb-2">
                          {item.technician.skills.map((s) => (
                            <SkillTag key={s} skill={s} />
                          ))}
                        </div>
                        <div className="text-xs text-slate-500">
                          当日已接单：{item.dailyAssignedCount}/{item.technician.dailyLimit}
                        </div>
                      </div>
                      <div className="text-right">
                        {item.available ? (
                          <button
                            onClick={() => handleAssign(item.technician.id)}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                          >
                            派单
                          </button>
                        ) : (
                          <div className="text-xs text-red-600 space-y-0.5">
                            {item.reasons.map((r, i) => (
                              <div key={i} className="flex items-center gap-1">
                                <XCircle className="w-3 h-3" />
                                {r}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              备注记录
            </h3>

            <form onSubmit={handleAddNote} className="mb-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="追加备注..."
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all resize-none"
                disabled={submitting}
              />
              <div className="flex justify-end mt-2">
                <button
                  type="submit"
                  disabled={submitting || !newNote.trim() || isClosed}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  添加备注
                </button>
              </div>
            </form>

            <div className="space-y-3 max-h-64 overflow-y-auto">
              {notes.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-400">暂无备注</div>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="bg-slate-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-700">{note.operator}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(note.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h3 className="font-semibold text-slate-900 mb-3">状态推进</h3>
            <div className="space-y-2">
              {isPendingAssign && (
                <div className="text-xs text-slate-500 bg-amber-50 p-2 rounded border border-amber-200">
                  工单处于待派单状态，请在左侧选择技师进行派单。
                </div>
              )}
              {isInProgress && (
                <button
                  onClick={() => handleChangeStatus('pending_verify', '确认提交验收？')}
                  className="w-full py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  提交验收
                </button>
              )}
              {isPendingVerify && (
                <>
                  <button
                    onClick={() => handleChangeStatus('closed', '确认验收通过并关闭工单？')}
                    className="w-full py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    验收通过，关闭工单
                  </button>
                  <button
                    onClick={() => handleChangeStatus('in_progress', '确认退回处理？')}
                    className="w-full py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    退回处理
                  </button>
                </>
              )}
              {isClosed && (
                <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded border border-slate-200 text-center">
                  工单已关闭，不可再修改状态或改派。
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-medium text-slate-500 mb-2">当前状态流转</h4>
              <div className="flex items-center text-xs">
                {(['pending_assign', 'in_progress', 'pending_verify', 'closed'] as TicketStatus[]).map(
                  (s, i, arr) => {
                    const passed =
                      arr.indexOf(ticket.status) >= i ||
                      (ticket.status === 'closed' && true);
                    const isCurrent = ticket.status === s;
                    return (
                      <div key={s} className="flex items-center">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isCurrent
                              ? 'bg-blue-600 text-white'
                              : passed
                                ? 'bg-green-500 text-white'
                                : 'bg-slate-200 text-slate-400'
                          }`}
                        >
                          {i + 1}
                        </div>
                        {i < arr.length - 1 && (
                          <div
                            className={`w-6 h-0.5 ${passed ? 'bg-green-500' : 'bg-slate-200'}`}
                          />
                        )}
                      </div>
                    );
                  },
                )}
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>待派单</span>
                <span>处理中</span>
                <span>待验收</span>
                <span>已关闭</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-600" />
              操作日志
            </h3>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {auditLogs.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-400">暂无操作记录</div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="relative pl-5 pb-3 border-l-2 border-slate-200 last:border-l-0">
                    <div className="absolute left-0 top-0 w-2.5 h-2.5 rounded-full -translate-x-[5px] bg-blue-500" />
                    <div className="text-xs">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-medium text-slate-700">{log.operator}</span>
                        {log.action === 'undo' && (
                          <span className="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                            已撤销
                          </span>
                        )}
                      </div>
                      <div className="text-slate-600">{log.description}</div>
                      <div className="text-slate-400 mt-0.5">
                        {new Date(log.createdAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
