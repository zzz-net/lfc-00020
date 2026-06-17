import { db, exportDir, generateBatchNo, now } from '../db.js';
import type {
  ExportBatch,
  ExportBatchStatus,
  ExportFilters,
  TicketSnapshot,
  TicketStatus,
  Technician,
} from '../../shared/types.js';
import {
  REWORK_STATUS_LABELS,
  SKILL_LABELS,
  STATUS_LABELS,
  URGENCY_LABELS,
} from '../../shared/types.js';
import path from 'path';
import fs from 'fs';

const ADMIN_OPERATORS = new Set(['管理员', '调度员A', '调度员B']);

function _isAdmin(operator: string): boolean {
  return ADMIN_OPERATORS.has(operator);
}

function _isTechnicianName(name: string): boolean {
  const row = db.prepare('SELECT id FROM technicians WHERE name = ?').get(name) as { id: number } | undefined;
  return !!row;
}

function _buildFilterSummary(filters: ExportFilters): string {
  const parts: string[] = [];
  if (filters.startDate) parts.push(`起始:${filters.startDate}`);
  if (filters.endDate) parts.push(`截止:${filters.endDate}`);
  if (filters.technicianId) {
    const tech = db.prepare('SELECT name FROM technicians WHERE id = ?').get(filters.technicianId) as { name: string } | undefined;
    parts.push(`技师:${tech?.name ?? '未知'}`);
  }
  if (filters.status) {
    parts.push(`状态:${STATUS_LABELS[filters.status] ?? filters.status}`);
  }
  return parts.length ? parts.join(' | ') : '全部工单';
}

function _escape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function _rowToExportBatch(row: any): ExportBatch {
  return {
    id: row.id,
    batchNo: row.batch_no,
    operator: row.operator,
    filters: JSON.parse(row.filters),
    filterSummary: row.filter_summary,
    ticketIds: JSON.parse(row.ticket_ids),
    status: row.status as ExportBatchStatus,
    totalCount: row.total_count,
    exportedCount: row.exported_count,
    failedReason: row.failed_reason,
    filePath: row.file_path,
    fileName: row.file_name,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
  };
}

function _rowToTicketSnapshot(row: any): TicketSnapshot {
  return {
    ticketId: row.ticket_id,
    ticketNo: row.ticket_no,
    title: row.title,
    location: row.location,
    description: row.description,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    urgency: row.urgency,
    expectedDate: row.expected_date,
    status: row.status,
    technicianId: row.technician_id,
    technicianName: row.technician_name,
    assignedAt: row.assigned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reworkStatus: row.rework_status,
    reworkApplicant: row.rework_applicant,
    reworkReason: row.rework_reason,
    reworkReviewer: row.rework_reviewer,
    reworkComment: row.rework_comment,
    reworkCreatedAt: row.rework_created_at,
    reviewedAt: row.reviewed_at,
  };
}

function _fetchTicketsWithFilters(filters: ExportFilters): any[] {
  let sql = `
    SELECT t.*, tec.name as technician_name, tec.employee_id, tec.skills,
           r.status as rework_status, r.applicant as rework_applicant, 
           r.reason as rework_reason, r.reviewer as rework_reviewer,
           r.review_comment as rework_comment, r.reviewed_at, r.created_at as rework_created_at
    FROM tickets t LEFT JOIN technicians tec ON t.technician_id = tec.id
    LEFT JOIN (
      SELECT r1.* FROM rework_applications r1
      INNER JOIN (
        SELECT ticket_id, MAX(id) as max_id FROM rework_applications GROUP BY ticket_id
      ) r2 ON r1.id = r2.max_id
    ) r ON t.id = r.ticket_id
    WHERE 1=1
  `;
  const sqlParams: any[] = [];
  if (filters.startDate) {
    sql += ' AND DATE(t.created_at) >= ?';
    sqlParams.push(filters.startDate);
  }
  if (filters.endDate) {
    sql += ' AND DATE(t.created_at) <= ?';
    sqlParams.push(filters.endDate);
  }
  if (filters.technicianId !== undefined) {
    sql += ' AND t.technician_id = ?';
    sqlParams.push(filters.technicianId);
  }
  if (filters.status) {
    sql += ' AND t.status = ?';
    sqlParams.push(filters.status);
  }
  sql += ' ORDER BY t.created_at DESC';
  return db.prepare(sql).all(...sqlParams) as any[];
}

export function checkDuplicateSubmission(operator: string, filters: ExportFilters): ExportBatch | null {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT * FROM export_batches 
       WHERE operator = ? AND created_at >= ? AND status NOT IN ('cancelled', 'failed')
       ORDER BY created_at DESC`
    )
    .all(operator, fiveMinutesAgo) as any[];

  for (const row of rows) {
    const existingFilters: ExportFilters = JSON.parse(row.filters);
    const same =
      existingFilters.startDate === filters.startDate &&
      existingFilters.endDate === filters.endDate &&
      existingFilters.technicianId === filters.technicianId &&
      existingFilters.status === filters.status;
    if (same) {
      return _rowToExportBatch(row);
    }
  }
  return null;
}

export function createExportBatch(params: {
  operator: string;
  filters: ExportFilters;
}): ExportBatch {
  const { operator, filters } = params;

  if (!_isAdmin(operator) && !_isTechnicianName(operator)) {
    throw new Error('操作人不存在');
  }

  const effectiveFilters: ExportFilters = { ...filters };
  if (!_isAdmin(operator)) {
    const tech = db.prepare('SELECT id FROM technicians WHERE name = ?').get(operator) as { id: number } | undefined;
    if (!tech) throw new Error('操作人不是技师');
    effectiveFilters.technicianId = tech.id;
  }

  const duplicate = checkDuplicateSubmission(operator, effectiveFilters);
  if (duplicate) {
    throw new Error(`5分钟内已有相同条件的导出任务正在处理中：${duplicate.batchNo}`);
  }

  const tickets = _fetchTicketsWithFilters(effectiveFilters);
  const ticketIds = tickets.map((t) => t.id);
  const batchNo = generateBatchNo();
  const filterSummary = _buildFilterSummary(effectiveFilters);
  const createdAt = now();

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO export_batches (
          batch_no, operator, filters, filter_summary, ticket_ids, 
          status, total_count, exported_count, created_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, ?)`
      )
      .run(
        batchNo,
        operator,
        JSON.stringify(effectiveFilters),
        filterSummary,
        JSON.stringify(ticketIds),
        ticketIds.length,
        createdAt
      );
    const batchId = Number(info.lastInsertRowid);

    const insertSnapshot = db.prepare(`
      INSERT INTO export_ticket_snapshots (
        batch_id, ticket_id, ticket_no, title, location, description,
        contact_name, contact_phone, urgency, expected_date, status,
        technician_id, technician_name, assigned_at, created_at, updated_at,
        rework_status, rework_applicant, rework_reason, rework_reviewer,
        rework_comment, rework_created_at, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of tickets) {
      let skillsStr = '';
      try {
        if (t.skills) {
          const arr = JSON.parse(t.skills) as string[];
          skillsStr = arr.map((s) => (SKILL_LABELS as any)[s] ?? s).join('、');
        }
      } catch {
        /* ignore */
      }
      insertSnapshot.run(
        batchId,
        t.id,
        t.ticket_no,
        t.title,
        t.location,
        t.description,
        t.contact_name,
        t.contact_phone,
        t.urgency,
        t.expected_date,
        t.status,
        t.technician_id,
        t.technician_name,
        t.assigned_at,
        t.created_at,
        t.updated_at,
        t.rework_status,
        t.rework_applicant,
        t.rework_reason,
        t.rework_reviewer,
        t.rework_comment,
        t.rework_created_at,
        t.reviewed_at
      );
    }
    return batchId;
  });

  const batchId = tx();

  setTimeout(() => {
    try {
      processExportBatch(batchId);
    } catch (e) {
      console.error('导出批次后台处理失败:', e);
    }
  }, 300);

  return getExportBatchById(batchId, operator)!;
}

export function processExportBatch(batchId: number): void {
  const batchRow = db.prepare('SELECT * FROM export_batches WHERE id = ?').get(batchId) as any;
  if (!batchRow) return;
  if (batchRow.status !== 'pending') return;

  db.prepare("UPDATE export_batches SET status = 'processing', started_at = ? WHERE id = ?").run(now(), batchId);

  try {
    const snapshotRows = db
      .prepare('SELECT * FROM export_ticket_snapshots WHERE batch_id = ? ORDER BY id')
      .all(batchId) as any[];

    const headers = [
      '工单编号',
      '标题',
      '地点',
      '故障描述',
      '联系人',
      '联系电话',
      '紧急程度',
      '期望完成日期',
      '状态',
      '指派技师',
      '派单时间',
      '创建时间',
      '更新时间',
      '返工申请状态',
      '返工申请人',
      '返工申请原因',
      '返工审批人',
      '返工审批意见',
      '返工申请时间',
      '返工审批时间',
    ];

    const body = snapshotRows.map((r) => {
      return [
        r.ticket_no,
        r.title,
        r.location,
        r.description,
        r.contact_name,
        r.contact_phone,
        (URGENCY_LABELS as any)[r.urgency] ?? r.urgency,
        r.expected_date,
        (STATUS_LABELS as any)[r.status] ?? r.status,
        r.technician_name ?? '',
        r.assigned_at ?? '',
        r.created_at,
        r.updated_at,
        r.rework_status ? (REWORK_STATUS_LABELS as any)[r.rework_status] ?? r.rework_status : '',
        r.rework_applicant ?? '',
        r.rework_reason ?? '',
        r.rework_reviewer ?? '',
        r.rework_comment ?? '',
        r.rework_created_at ?? '',
        r.reviewed_at ?? '',
      ];
    });

    const all = [headers, ...body];
    const csv = '\uFEFF' + all.map((row) => row.map(_escape).join(',')).join('\r\n');

    const datePart = new Date().toISOString().slice(0, 10);
    const fileName = `export-${batchRow.batch_no}-${datePart}.csv`;
    const filePath = path.join(exportDir, fileName);
    fs.writeFileSync(filePath, csv, 'utf8');

    db.prepare(
      "UPDATE export_batches SET status = 'completed', exported_count = ?, file_path = ?, file_name = ?, completed_at = ? WHERE id = ?"
    ).run(snapshotRows.length, filePath, fileName, now(), batchId);
  } catch (err: any) {
    db.prepare("UPDATE export_batches SET status = 'failed', failed_reason = ?, completed_at = ? WHERE id = ?").run(
      err?.message ?? String(err),
      now(),
      batchId
    );
  }
}

export function listExportBatches(params: {
  operator: string;
  status?: ExportBatchStatus;
}): ExportBatch[] {
  let sql = 'SELECT * FROM export_batches WHERE 1=1';
  const sqlParams: any[] = [];

  if (!_isAdmin(params.operator)) {
    sql += ' AND operator = ?';
    sqlParams.push(params.operator);
  }

  if (params.status) {
    sql += ' AND status = ?';
    sqlParams.push(params.status);
  }

  sql += ' ORDER BY created_at DESC LIMIT 100';
  const rows = db.prepare(sql).all(...sqlParams) as any[];
  return rows.map(_rowToExportBatch);
}

export function getExportBatchById(id: number, operator: string): ExportBatch | null {
  const row = db.prepare('SELECT * FROM export_batches WHERE id = ?').get(id) as any;
  if (!row) return null;

  if (!_isAdmin(operator) && row.operator !== operator) {
    throw new Error('无权查看此导出批次');
  }

  return _rowToExportBatch(row);
}

export function getBatchSnapshotsWithDiff(batchId: number, operator: string): TicketSnapshot[] {
  const batch = getExportBatchById(batchId, operator);
  if (!batch) throw new Error('导出批次不存在');

  const snapshotRows = db
    .prepare('SELECT * FROM export_ticket_snapshots WHERE batch_id = ? ORDER BY id')
    .all(batchId) as any[];

  return snapshotRows.map((row) => {
    const snap = _rowToTicketSnapshot(row);

    const current = db
      .prepare(
        `SELECT t.status, tec.name as technician_name 
         FROM tickets t LEFT JOIN technicians tec ON t.technician_id = tec.id 
         WHERE t.id = ?`
      )
      .get(snap.ticketId) as { status: TicketStatus; technician_name?: string } | undefined;

    if (current) {
      snap.hasStatusDiff = current.status !== snap.status;
      snap.hasTechnicianDiff = (current.technician_name ?? '') !== (snap.technicianName ?? '');
      snap.currentStatus = current.status;
      snap.currentTechnicianName = current.technician_name;
    }

    return snap;
  });
}

export function cancelExportBatch(id: number, operator: string): ExportBatch {
  const row = db.prepare('SELECT * FROM export_batches WHERE id = ?').get(id) as any;
  if (!row) throw new Error('导出批次不存在');

  if (!_isAdmin(operator) && row.operator !== operator) {
    throw new Error('无权取消此导出批次');
  }

  if (row.status !== 'pending') {
    throw new Error('只能取消等待生成中的批次');
  }

  db.prepare("UPDATE export_batches SET status = 'cancelled', cancelled_at = ?, cancelled_by = ? WHERE id = ?").run(
    now(),
    operator,
    id
  );

  return getExportBatchById(id, operator)!;
}

export function retryExportBatch(id: number, operator: string): ExportBatch {
  const row = db.prepare('SELECT * FROM export_batches WHERE id = ?').get(id) as any;
  if (!row) throw new Error('导出批次不存在');

  if (!_isAdmin(operator) && row.operator !== operator) {
    throw new Error('无权重试此导出批次');
  }

  if (row.status !== 'failed' && row.status !== 'cancelled') {
    throw new Error('只能重试失败或已取消的批次');
  }

  const filters: ExportFilters = JSON.parse(row.filters);
  return createExportBatch({ operator, filters });
}

export function getExportFilePath(id: number, operator: string): { path: string; fileName: string } {
  const batch = getExportBatchById(id, operator);
  if (!batch) throw new Error('导出批次不存在');
  if (batch.status !== 'completed') throw new Error('此批次尚未生成完成');
  if (!batch.filePath || !batch.fileName) throw new Error('文件路径不存在');
  if (!fs.existsSync(batch.filePath)) throw new Error('导出文件已丢失');
  return { path: batch.filePath, fileName: batch.fileName };
}
