import { db, now } from '../db.js';
import type { ReworkApplication, ReworkStatus, Ticket } from '../../shared/types.js';
import { addAuditLog } from './audit.js';
import { getTicketById } from './tickets.js';

export const ADMIN_OPERATORS = ['管理员', '调度员A', '调度员B'];

function _mapRework(row: any): ReworkApplication {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    applicant: row.applicant,
    reason: row.reason,
    status: row.status as ReworkStatus,
    reviewer: row.reviewer ?? undefined,
    reviewComment: row.review_comment ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getReworkByTicket(ticketId: number): ReworkApplication[] {
  const rows = db
    .prepare('SELECT * FROM rework_applications WHERE ticket_id = ? ORDER BY created_at DESC')
    .all(ticketId) as any[];
  return rows.map(_mapRework);
}

export function getPendingRework(ticketId: number): ReworkApplication | null {
  const row = db
    .prepare("SELECT * FROM rework_applications WHERE ticket_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1")
    .get(ticketId) as any;
  return row ? _mapRework(row) : null;
}

export function getReworkById(id: number): ReworkApplication | null {
  const row = db.prepare('SELECT * FROM rework_applications WHERE id = ?').get(id) as any;
  return row ? _mapRework(row) : null;
}

export function isAdmin(operator: string): boolean {
  return ADMIN_OPERATORS.includes(operator);
}

export function applyRework(
  ticketId: number,
  applicant: string,
  reason: string,
): ReworkApplication {
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    throw new Error('工单不存在');
  }
  if (ticket.status !== 'closed') {
    throw new Error('只有已关闭的工单才能申请复核');
  }

  const pending = getPendingRework(ticketId);
  if (pending) {
    throw new Error('该工单已有待审批的复核申请，请先等待处理或撤回');
  }

  const isCreator = _isTicketCreator(ticketId, applicant);
  if (!isCreator && !isAdmin(applicant)) {
    throw new Error('只有工单创建人或管理员才能申请复核');
  }

  const stmt = db.prepare(`
    INSERT INTO rework_applications (ticket_id, applicant, reason, status, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `);
  const result = stmt.run(ticketId, applicant, reason, now(), now());
  const rework = getReworkById(Number(result.lastInsertRowid))!;

  addAuditLog({
    ticketId,
    operator: applicant,
    action: 'rework_apply',
    afterData: rework,
    description: `申请复核：${reason.slice(0, 80)}${reason.length > 80 ? '…' : ''}`,
  });

  return rework;
}

export function withdrawRework(
  ticketId: number,
  reworkId: number,
  operator: string,
): ReworkApplication {
  const rework = getReworkById(reworkId);
  if (!rework) {
    throw new Error('复核申请不存在');
  }
  if (rework.ticketId !== ticketId) {
    throw new Error('申请与工单不匹配');
  }
  if (rework.status !== 'pending') {
    throw new Error('只能撤回报批中的申请');
  }
  if (rework.applicant !== operator) {
    throw new Error('只能撤回自己提交的申请');
  }

  db.prepare(
    "UPDATE rework_applications SET status = 'withdrawn', updated_at = ? WHERE id = ?",
  ).run(now(), reworkId);

  const updated = getReworkById(reworkId)!;

  addAuditLog({
    ticketId,
    operator,
    action: 'rework_withdraw',
    beforeData: rework,
    afterData: updated,
    description: '撤回复核申请',
  });

  return updated;
}

export function reviewRework(
  ticketId: number,
  reworkId: number,
  approved: boolean,
  comment: string,
  reviewer: string,
): { rework: ReworkApplication; ticket?: Ticket } {
  if (!isAdmin(reviewer)) {
    throw new Error('只有管理员才能审批复核申请');
  }

  const rework = getReworkById(reworkId);
  if (!rework) {
    throw new Error('复核申请不存在');
  }
  if (rework.ticketId !== ticketId) {
    throw new Error('申请与工单不匹配');
  }
  if (rework.status !== 'pending') {
    throw new Error('只能审批报批中的申请');
  }

  const newStatus: ReworkStatus = approved ? 'approved' : 'rejected';

  db.prepare(
    `UPDATE rework_applications 
     SET status = ?, reviewer = ?, review_comment = ?, reviewed_at = ?, updated_at = ? 
     WHERE id = ?`,
  ).run(newStatus, reviewer, comment, now(), now(), reworkId);

  const updatedRework = getReworkById(reworkId)!;

  addAuditLog({
    ticketId,
    operator: reviewer,
    action: approved ? 'rework_approve' : 'rework_reject',
    beforeData: rework,
    afterData: updatedRework,
    description: `${approved ? '通过' : '拒绝'}复核申请：${comment.slice(0, 80)}${comment.length > 80 ? '…' : ''}`,
  });

  let ticket: Ticket | undefined;
  if (approved) {
    const beforeTicket = getTicketById(ticketId)!;
    db.prepare(
      "UPDATE tickets SET status = 'pending_verify', updated_at = ? WHERE id = ?",
    ).run(now(), ticketId);

    ticket = getTicketById(ticketId)!;

    addAuditLog({
      ticketId,
      operator: reviewer,
      action: 'rework_status_rollback',
      beforeData: beforeTicket,
      afterData: ticket,
      description: '工单状态由「已关闭」回退至「待验收」',
    });
  }

  return { rework: updatedRework, ticket };
}

export function getLatestReworkForTicket(ticketId: number): ReworkApplication | null {
  const row = db
    .prepare('SELECT * FROM rework_applications WHERE ticket_id = ? ORDER BY id DESC LIMIT 1')
    .get(ticketId) as any;
  return row ? _mapRework(row) : null;
}

function _isTicketCreator(ticketId: number, operator: string): boolean {
  const row = db
    .prepare(
      `SELECT al.operator 
       FROM audit_logs al 
       WHERE al.ticket_id = ? AND al.action = 'create' 
       ORDER BY al.id ASC LIMIT 1`,
    )
    .get(ticketId) as any;
  if (!row) return false;
  return row.operator === operator;
}
