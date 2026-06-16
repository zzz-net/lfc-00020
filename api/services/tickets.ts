import { db, generateTicketNo, now } from '../db.js';
import type {
  Note,
  OperationSnapshot,
  Skill,
  Ticket,
  TicketStatus,
  Urgency,
} from '../../shared/types.js';
import { TICKET_REQUIRED_SKILLS_MAP } from '../../shared/types.js';
import { addAuditLog } from './audit.js';
import {
  getDailyAssignedCount,
  getTechnicianById,
  isTechnicianOnVacation,
} from './technicians.js';

const STATUS_FLOW: Record<TicketStatus, TicketStatus[]> = {
  pending_assign: ['in_progress'],
  in_progress: ['pending_verify'],
  pending_verify: ['closed'],
  closed: [],
};

function _mapTicket(row: any): Ticket {
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    title: row.title,
    location: row.location,
    description: row.description,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    urgency: row.urgency as Urgency,
    expectedDate: row.expected_date,
    status: row.status as TicketStatus,
    technicianId: row.technician_id ?? undefined,
    technicianName: row.technician_name ?? undefined,
    assignedAt: row.assigned_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function _getTicketRaw(id: number): any | null {
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) ?? null;
}

export function inferRequiredSkills(title: string, description: string): Skill[] {
  const text = `${title} ${description}`;
  const set = new Set<Skill>();
  for (const key of Object.keys(TICKET_REQUIRED_SKILLS_MAP)) {
    if (text.includes(key)) {
      for (const s of TICKET_REQUIRED_SKILLS_MAP[key]) {
        set.add(s);
      }
    }
  }
  return Array.from(set);
}

export function getTickets(status?: TicketStatus): Ticket[] {
  let sql = `
    SELECT t.*, tec.name as technician_name
    FROM tickets t LEFT JOIN technicians tec ON t.technician_id = tec.id
  `;
  const params: any[] = [];
  if (status) {
    sql += ' WHERE t.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY t.created_at DESC';
  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(_mapTicket);
}

export function getTicketById(id: number): Ticket | null {
  const row = db
    .prepare(
      `SELECT t.*, tec.name as technician_name
       FROM tickets t LEFT JOIN technicians tec ON t.technician_id = tec.id
       WHERE t.id = ?`,
    )
    .get(id) as any;
  return row ? _mapTicket(row) : null;
}

export function createTicket(params: {
  title: string;
  location: string;
  description: string;
  contactName: string;
  contactPhone: string;
  urgency: Urgency;
  expectedDate: string;
  operator: string;
}): Ticket {
  const ticketNo = generateTicketNo();
  const stmt = db.prepare(`
    INSERT INTO tickets (ticket_no, title, location, description, contact_name, contact_phone, urgency, expected_date, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_assign', ?, ?)
  `);
  const result = stmt.run(
    ticketNo,
    params.title,
    params.location,
    params.description,
    params.contactName,
    params.contactPhone,
    params.urgency,
    params.expectedDate,
    now(),
    now(),
  );
  const ticket = getTicketById(Number(result.lastInsertRowid))!;
  addAuditLog({
    ticketId: ticket.id,
    operator: params.operator,
    action: 'create',
    afterData: ticket,
    description: `创建工单 ${ticket.ticketNo}`,
  });
  return ticket;
}

export function validateAssign(ticketId: number, technicianId: number): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const ticket = getTicketById(ticketId);
  if (!ticket) return { ok: false, errors: ['工单不存在'] };
  if (ticket.status === 'closed') {
    return { ok: false, errors: ['已关闭工单不能改派'] };
  }
  const tech = getTechnicianById(technicianId);
  if (!tech) return { ok: false, errors: ['技师不存在'] };

  const requiredSkills = inferRequiredSkills(ticket.title, ticket.description);
  if (requiredSkills.length > 0) {
    const missing = requiredSkills.filter((s) => !tech.skills.includes(s));
    if (missing.length > 0) {
      errors.push(`技能不匹配：缺少 ${missing.join(', ')}`);
    }
  }

  if (isTechnicianOnVacation(technicianId, ticket.expectedDate)) {
    errors.push(`该技师在 ${ticket.expectedDate} 处于休假中`);
  }

  const todayCount = getDailyAssignedCount(technicianId, ticket.expectedDate);
  if (todayCount >= tech.dailyLimit) {
    errors.push(`该技师当日已达接单上限（${todayCount}/${tech.dailyLimit}）`);
  }

  const overlap = db
    .prepare(
      `SELECT 1 FROM tickets 
       WHERE technician_id = ? AND id != ? AND status != 'closed'
       AND expected_date = ? LIMIT 1`,
    )
    .get(technicianId, ticketId, ticket.expectedDate);
  if (overlap) {
    errors.push('与该技师同日期已有工单时间冲突');
  }

  return { ok: errors.length === 0, errors };
}

export function assignTicket(ticketId: number, technicianId: number, operator: string): Ticket {
  const validation = validateAssign(ticketId, technicianId);
  if (!validation.ok) {
    throw new Error(validation.errors.join('；'));
  }
  const before = getTicketById(ticketId)!;
  const tech = getTechnicianById(technicianId)!;

  const snapshotId = addAuditLog({
    ticketId,
    operator,
    action: 'assign',
    beforeData: before,
    description: `将工单派给技师 ${tech.name}`,
  });
  _saveSnapshot(ticketId, snapshotId, before.status, before.technicianId);

  db.prepare(
    'UPDATE tickets SET technician_id = ?, assigned_at = ?, status = ?, updated_at = ? WHERE id = ?',
  ).run(technicianId, now(), 'in_progress', now(), ticketId);

  const after = getTicketById(ticketId)!;
  _updateAuditAfterData(snapshotId, after);
  return after;
}

export function changeTicketStatus(ticketId: number, newStatus: TicketStatus, operator: string): Ticket {
  const before = getTicketById(ticketId);
  if (!before) throw new Error('工单不存在');
  if (before.status === newStatus) return before;

  if (before.status === 'closed') {
    throw new Error('已关闭工单不能变更状态');
  }

  const allowed = STATUS_FLOW[before.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`不能从「${before.status}」直接变更为「${newStatus}」`);
  }

  if (newStatus === 'closed' && before.status === 'pending_assign') {
    throw new Error('待派单工单不能直接关闭，请先派单处理');
  }

  const snapshotId = addAuditLog({
    ticketId,
    operator,
    action: 'status_change',
    beforeData: before,
    description: `状态变更：${before.status} → ${newStatus}`,
  });
  _saveSnapshot(ticketId, snapshotId, before.status, before.technicianId);

  db.prepare('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?').run(
    newStatus,
    now(),
    ticketId,
  );

  const after = getTicketById(ticketId)!;
  _updateAuditAfterData(snapshotId, after);
  return after;
}

export function undoLastOperation(ticketId: number, operator: string): Ticket {
  const snapshot = _getSnapshot(ticketId);
  if (!snapshot) {
    throw new Error('没有可撤销的操作');
  }
  const auditLog = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(snapshot.auditLogId) as any;
  if (!auditLog) throw new Error('找不到被撤销的操作记录');
  if (auditLog.undo_of_id !== null) {
    throw new Error('该操作已经被撤销过');
  }

  const before = getTicketById(ticketId)!;

  const restoreTechId = snapshot.previousTechnicianId ?? null;
  const restoreStatus = snapshot.previousStatus;
  let assignedAtSql = 'assigned_at = assigned_at';
  const params: any[] = [restoreStatus, now()];
  if (restoreTechId === null) {
    assignedAtSql = 'assigned_at = NULL';
  }
  params.push(restoreTechId);
  params.push(ticketId);

  db.prepare(
    `UPDATE tickets SET status = ?, updated_at = ?, technician_id = ?, ${assignedAtSql} WHERE id = ?`,
  ).run(...params);

  addAuditLog({
    ticketId,
    operator,
    action: 'undo',
    beforeData: before,
    afterData: getTicketById(ticketId)!,
    description: `撤销操作：${auditLog.description}`,
    undoOfId: snapshot.auditLogId,
  });

  db.prepare('DELETE FROM operation_snapshots WHERE ticket_id = ?').run(ticketId);
  return getTicketById(ticketId)!;
}

export function getUndoSnapshot(ticketId: number): OperationSnapshot | null {
  return _getSnapshot(ticketId);
}

export function addNote(ticketId: number, content: string, operator: string): Note {
  const ticket = getTicketById(ticketId);
  if (!ticket) throw new Error('工单不存在');
  const stmt = db.prepare(`
    INSERT INTO notes (ticket_id, operator, content, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(ticketId, operator, content, now());
  addAuditLog({
    ticketId,
    operator,
    action: 'note_add',
    description: `追加备注：${content.slice(0, 50)}${content.length > 50 ? '…' : ''}`,
  });
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid) as any;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    operator: row.operator,
    content: row.content,
    createdAt: row.created_at,
  };
}

export function getNotesByTicket(ticketId: number): Note[] {
  const rows = db
    .prepare('SELECT * FROM notes WHERE ticket_id = ? ORDER BY created_at DESC')
    .all(ticketId) as any[];
  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    operator: r.operator,
    content: r.content,
    createdAt: r.created_at,
  }));
}

function _saveSnapshot(
  ticketId: number,
  auditLogId: number,
  previousStatus: TicketStatus,
  previousTechnicianId?: number,
) {
  db.prepare(
    `INSERT INTO operation_snapshots (ticket_id, audit_log_id, previous_status, previous_technician_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ticket_id) DO UPDATE SET
       audit_log_id = excluded.audit_log_id,
       previous_status = excluded.previous_status,
       previous_technician_id = excluded.previous_technician_id`,
  ).run(ticketId, auditLogId, previousStatus, previousTechnicianId ?? null);
}

function _getSnapshot(ticketId: number): OperationSnapshot | null {
  const row = db.prepare('SELECT * FROM operation_snapshots WHERE ticket_id = ?').get(ticketId) as any;
  if (!row) return null;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    auditLogId: row.audit_log_id,
    previousStatus: row.previous_status as TicketStatus,
    previousTechnicianId: row.previous_technician_id ?? undefined,
  };
}

function _updateAuditAfterData(auditLogId: number, afterData: unknown) {
  db.prepare('UPDATE audit_logs SET after_data = ? WHERE id = ?').run(
    JSON.stringify(afterData),
    auditLogId,
  );
}
