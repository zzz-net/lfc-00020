import { db, now } from '../db.js';
import type { Skill, Technician, Vacation } from '../../shared/types.js';
import { addAuditLog } from './audit.js';

export function getTechnicians(): Technician[] {
  const rows = db.prepare('SELECT * FROM technicians ORDER BY id ASC').all() as any[];
  return rows.map(_mapTechnician);
}

export function getTechnicianById(id: number): Technician | null {
  const row = db.prepare('SELECT * FROM technicians WHERE id = ?').get(id) as any;
  return row ? _mapTechnician(row) : null;
}

export function createTechnician(params: {
  name: string;
  employeeId: string;
  skills: Skill[];
  dailyLimit: number;
  operator: string;
}): Technician {
  const existing = db.prepare('SELECT id FROM technicians WHERE employee_id = ?').get(params.employeeId);
  if (existing) {
    throw new Error('该工号已存在');
  }
  const stmt = db.prepare(`
    INSERT INTO technicians (name, employee_id, skills, daily_limit, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    params.name,
    params.employeeId,
    JSON.stringify(params.skills),
    params.dailyLimit,
    now(),
  );
  const tech = getTechnicianById(Number(result.lastInsertRowid))!;
  addAuditLog({
    operator: params.operator,
    action: 'technician_create',
    afterData: tech,
    description: `新增技师：${tech.name}（${tech.employeeId}）`,
  });
  return tech;
}

export function updateTechnician(
  id: number,
  params: { name?: string; skills?: Skill[]; dailyLimit?: number; operator: string },
): Technician {
  const existing = getTechnicianById(id);
  if (!existing) throw new Error('技师不存在');
  const newName = params.name ?? existing.name;
  const newSkills = params.skills ?? existing.skills;
  const newLimit = params.dailyLimit ?? existing.dailyLimit;
  db.prepare(
    'UPDATE technicians SET name = ?, skills = ?, daily_limit = ? WHERE id = ?',
  ).run(newName, JSON.stringify(newSkills), newLimit, id);
  const updated = getTechnicianById(id)!;
  addAuditLog({
    operator: params.operator,
    action: 'technician_update',
    beforeData: existing,
    afterData: updated,
    description: `更新技师信息：${updated.name}`,
  });
  return updated;
}

export function deleteTechnician(id: number, operator: string): void {
  const existing = getTechnicianById(id);
  if (!existing) throw new Error('技师不存在');
  const activeCount = db
    .prepare("SELECT COUNT(*) as c FROM tickets WHERE technician_id = ? AND status != 'closed'")
    .get(id) as { c: number };
  if (activeCount.c > 0) {
    throw new Error('该技师仍有未完成工单，无法删除');
  }
  db.prepare('DELETE FROM vacations WHERE technician_id = ?').run(id);
  db.prepare('DELETE FROM technicians WHERE id = ?').run(id);
  addAuditLog({
    operator,
    action: 'technician_delete',
    beforeData: existing,
    description: `删除技师：${existing.name}（${existing.employeeId}）`,
  });
}

export function getVacationsByTechnician(technicianId: number): Vacation[] {
  const rows = db
    .prepare('SELECT * FROM vacations WHERE technician_id = ? ORDER BY start_date DESC')
    .all(technicianId) as any[];
  return rows.map(_mapVacation);
}

export function createVacation(params: {
  technicianId: number;
  startDate: string;
  endDate: string;
  reason?: string;
  operator: string;
}): Vacation {
  const tech = getTechnicianById(params.technicianId);
  if (!tech) throw new Error('技师不存在');
  if (params.startDate > params.endDate) {
    throw new Error('开始日期不能晚于结束日期');
  }
  const stmt = db.prepare(`
    INSERT INTO vacations (technician_id, start_date, end_date, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(params.technicianId, params.startDate, params.endDate, params.reason ?? null, now());
  addAuditLog({
    operator: params.operator,
    action: 'vacation_create',
    description: `为 ${tech.name} 设置休假：${params.startDate} ~ ${params.endDate}${params.reason ? `（${params.reason}）` : ''}`,
  });
  const row = db.prepare('SELECT * FROM vacations WHERE id = ?').get(result.lastInsertRowid) as any;
  return _mapVacation(row);
}

export function isTechnicianOnVacation(technicianId: number, dateStr: string): boolean {
  const row = db
    .prepare(
      'SELECT 1 FROM vacations WHERE technician_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1',
    )
    .get(technicianId, dateStr, dateStr);
  return !!row;
}

export function getDailyAssignedCount(technicianId: number, dateStr: number | string): number {
  const date = typeof dateStr === 'string' ? dateStr : new Date(dateStr).toISOString().slice(0, 10);
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM tickets 
       WHERE technician_id = ? AND status != 'closed' 
       AND DATE(COALESCE(assigned_at, created_at)) = ?`,
    )
    .get(technicianId, date) as { c: number };
  return row.c;
}

function _mapTechnician(row: any): Technician {
  return {
    id: row.id,
    name: row.name,
    employeeId: row.employee_id,
    skills: JSON.parse(row.skills),
    dailyLimit: row.daily_limit,
    createdAt: row.created_at,
  };
}

function _mapVacation(row: any): Vacation {
  return {
    id: row.id,
    technicianId: row.technician_id,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason ?? undefined,
  };
}
