import { db, now } from '../db.js';
import type { AuditAction, AuditLog } from '../../shared/types.js';

export function addAuditLog(params: {
  ticketId?: number;
  operator: string;
  action: AuditAction;
  beforeData?: unknown;
  afterData?: unknown;
  description: string;
  undoOfId?: number;
}): number {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (ticket_id, operator, action, before_data, after_data, description, created_at, undo_of_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    params.ticketId ?? null,
    params.operator,
    params.action,
    params.beforeData !== undefined ? JSON.stringify(params.beforeData) : null,
    params.afterData !== undefined ? JSON.stringify(params.afterData) : null,
    params.description,
    now(),
    params.undoOfId ?? null,
  );
  return Number(result.lastInsertRowid);
}

export function getAuditLogsByTicket(ticketId: number): AuditLog[] {
  const rows = db
    .prepare('SELECT * FROM audit_logs WHERE ticket_id = ? ORDER BY created_at DESC, id DESC')
    .all(ticketId) as any[];
  return rows.map(_mapAuditLog);
}

export function getAllAuditLogs(limit = 200): AuditLog[] {
  const rows = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit) as any[];
  return rows.map(_mapAuditLog);
}

function _mapAuditLog(row: any): AuditLog {
  return {
    id: row.id,
    ticketId: row.ticket_id ?? undefined,
    operator: row.operator,
    action: row.action,
    beforeData: row.before_data ?? undefined,
    afterData: row.after_data ?? undefined,
    description: row.description,
    createdAt: row.created_at,
    undoOfId: row.undo_of_id ?? undefined,
  };
}
