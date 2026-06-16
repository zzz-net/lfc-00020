import { db } from '../db.js';
import { SKILL_LABELS, STATUS_LABELS, URGENCY_LABELS } from '../../shared/types.js';

function _escape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function generateCsv(params: {
  startDate?: string;
  endDate?: string;
  technicianId?: number;
}): { filename: string; content: string } {
  let sql = `
    SELECT t.*, tec.name as technician_name, tec.employee_id, tec.skills
    FROM tickets t LEFT JOIN technicians tec ON t.technician_id = tec.id
    WHERE 1=1
  `;
  const sqlParams: any[] = [];
  if (params.startDate) {
    sql += ' AND DATE(t.created_at) >= ?';
    sqlParams.push(params.startDate);
  }
  if (params.endDate) {
    sql += ' AND DATE(t.created_at) <= ?';
    sqlParams.push(params.endDate);
  }
  if (params.technicianId !== undefined) {
    sql += ' AND t.technician_id = ?';
    sqlParams.push(params.technicianId);
  }
  sql += ' ORDER BY t.created_at DESC';

  const rows = db.prepare(sql).all(...sqlParams) as any[];

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
    '技师工号',
    '技师技能',
    '派单时间',
    '创建时间',
    '更新时间',
  ];

  const body = rows.map((r) => {
    let skillsStr = '';
    try {
      if (r.skills) {
        const arr = JSON.parse(r.skills) as string[];
        skillsStr = arr.map((s) => (SKILL_LABELS as any)[s] ?? s).join('、');
      }
    } catch {
      /* ignore */
    }
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
      r.employee_id ?? '',
      skillsStr,
      r.assigned_at ?? '',
      r.created_at,
      r.updated_at,
    ];
  });

  const all = [headers, ...body];
  const csv = '\uFEFF' + all.map((row) => row.map(_escape).join(',')).join('\r\n');

  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `work-orders-${datePart}.csv`;
  return { filename, content: csv };
}
