import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const exportDir = path.join(dataDir, 'exports');
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}
export { exportDir };

const dbPath = path.join(dataDir, 'app.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS technicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      employee_id TEXT UNIQUE NOT NULL,
      skills TEXT NOT NULL,
      daily_limit INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vacations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technician_id INTEGER NOT NULL REFERENCES technicians(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_no TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      urgency TEXT NOT NULL,
      expected_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_assign',
      technician_id INTEGER REFERENCES technicians(id),
      assigned_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id),
      operator TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER REFERENCES tickets(id),
      operator TEXT NOT NULL,
      action TEXT NOT NULL,
      before_data TEXT,
      after_data TEXT,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      undo_of_id INTEGER REFERENCES audit_logs(id)
    );

    CREATE TABLE IF NOT EXISTS operation_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER UNIQUE NOT NULL REFERENCES tickets(id),
      audit_log_id INTEGER NOT NULL REFERENCES audit_logs(id),
      previous_status TEXT NOT NULL,
      previous_technician_id INTEGER REFERENCES technicians(id)
    );

    CREATE TABLE IF NOT EXISTS rework_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id),
      applicant TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewer TEXT,
      review_comment TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS export_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_no TEXT UNIQUE NOT NULL,
      operator TEXT NOT NULL,
      filters TEXT NOT NULL,
      filter_summary TEXT NOT NULL,
      ticket_ids TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_count INTEGER NOT NULL DEFAULT 0,
      exported_count INTEGER NOT NULL DEFAULT 0,
      failed_reason TEXT,
      file_path TEXT,
      file_name TEXT,
      file_sha256 TEXT,
      file_size_bytes INTEGER,
      file_row_count INTEGER,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      retry_of_id INTEGER REFERENCES export_batches(id),
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      cancelled_by TEXT,
      recovered_at TEXT
    );

    CREATE TABLE IF NOT EXISTS export_ticket_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
      ticket_id INTEGER NOT NULL,
      ticket_no TEXT NOT NULL,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      urgency TEXT NOT NULL,
      expected_date TEXT NOT NULL,
      status TEXT NOT NULL,
      technician_id INTEGER,
      technician_name TEXT,
      assigned_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      rework_status TEXT,
      rework_applicant TEXT,
      rework_reason TEXT,
      rework_reviewer TEXT,
      rework_comment TEXT,
      rework_created_at TEXT,
      reviewed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_technician ON tickets(technician_id);
    CREATE INDEX IF NOT EXISTS idx_audit_ticket ON audit_logs(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_notes_ticket ON notes(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_rework_ticket ON rework_applications(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_rework_status ON rework_applications(status);
    CREATE INDEX IF NOT EXISTS idx_export_operator ON export_batches(operator);
    CREATE INDEX IF NOT EXISTS idx_export_status ON export_batches(status);
    CREATE INDEX IF NOT EXISTS idx_export_created ON export_batches(created_at);
    CREATE INDEX IF NOT EXISTS idx_snapshot_batch ON export_ticket_snapshots(batch_id);
    CREATE INDEX IF NOT EXISTS idx_snapshot_ticket ON export_ticket_snapshots(ticket_id);

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS launch_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'private',
      owner_username TEXT NOT NULL,
      service_type TEXT NOT NULL,
      command TEXT NOT NULL,
      cwd TEXT NOT NULL,
      fixed_port INTEGER NOT NULL,
      health_check_url TEXT NOT NULL,
      startup_timeout_sec INTEGER NOT NULL DEFAULT 60,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verification_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL,
      config_name TEXT NOT NULL,
      operator_username TEXT NOT NULL,
      pid INTEGER,
      actual_port INTEGER,
      status TEXT NOT NULL DEFAULT 'idle',
      page_check_status TEXT NOT NULL DEFAULT 'pending',
      api_check_status TEXT NOT NULL DEFAULT 'pending',
      failure_reason TEXT,
      timeline TEXT NOT NULL,
      duration_ms INTEGER,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_config_owner ON launch_configs(owner_username);
    CREATE INDEX IF NOT EXISTS idx_config_scope ON launch_configs(scope);
    CREATE INDEX IF NOT EXISTS idx_config_service_type ON launch_configs(service_type);
    CREATE INDEX IF NOT EXISTS idx_verification_config ON verification_records(config_id);
    CREATE INDEX IF NOT EXISTS idx_verification_operator ON verification_records(operator_username);
    CREATE INDEX IF NOT EXISTS idx_verification_status ON verification_records(status);
    CREATE INDEX IF NOT EXISTS idx_verification_created ON verification_records(created_at);
  `);

  _migrateExportBatches();

  try {
    db.prepare('CREATE INDEX IF NOT EXISTS idx_export_retry_of ON export_batches(retry_of_id)').run();
  } catch (e) {
    console.warn('创建 idx_export_retry_of 索引失败:', e);
  }

  const techCount = db.prepare('SELECT COUNT(*) as c FROM technicians').get() as { c: number };
  if (techCount.c === 0) {
    const insertTech = db.prepare(`
      INSERT INTO technicians (name, employee_id, skills, daily_limit, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    insertTech.run('张伟', 'T001', JSON.stringify(['air_conditioner', 'refrigerator', 'electrical']), 3);
    insertTech.run('李娜', 'T002', JSON.stringify(['computer', 'network', 'electrical']), 4);
    insertTech.run('王强', 'T003', JSON.stringify(['plumbing', 'elevator', 'washing_machine']), 2);

    const insertVac = db.prepare(`
      INSERT INTO vacations (technician_id, start_date, end_date, reason, created_at)
      VALUES (?, date('now', '+1 day'), date('now', '+1 day'), ?, datetime('now'))
    `);
    insertVac.run(1, '年假');

    const insertTicket = db.prepare(`
      INSERT INTO tickets (ticket_no, title, location, description, contact_name, contact_phone, urgency, expected_date, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_assign', datetime('now'), datetime('now'))
    `);
    insertTicket.run('WO-2026-0001', '3楼空调不制冷', '研发中心3楼301', '空调开机后不出冷风，已使用5年', '陈主管', '13800000001', 'high', _addDays(2));
    insertTicket.run('WO-2026-0002', '会议室投影仪无法开机', '行政楼2楼大会议室', '按电源键无反应，指示灯不亮', '刘助理', '13800000002', 'medium', _addDays(1));
  }

  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  if (userCount.c === 0) {
    const insertUser = db.prepare(`
      INSERT INTO users (username, role, display_name, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);
    insertUser.run('admin', 'admin', '系统管理员');
    insertUser.run('devuser', 'user', '开发用户');
  }

  const configCount = db.prepare('SELECT COUNT(*) as c FROM launch_configs').get() as { c: number };
  if (configCount.c === 0) {
    const projectRoot = path.join(__dirname, '..');
    const insertConfig = db.prepare(`
      INSERT INTO launch_configs (
        name, scope, owner_username, service_type, command, cwd,
        fixed_port, health_check_url, startup_timeout_sec, is_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `);
    insertConfig.run(
      '后端开发服务',
      'public',
      'admin',
      'backend',
      'npm run server:dev',
      projectRoot,
      3001,
      'http://localhost:3001/api/health',
      30
    );
    insertConfig.run(
      '前端开发服务',
      'public',
      'admin',
      'frontend',
      'npm run client:dev',
      projectRoot,
      5173,
      'http://localhost:5173/',
      30
    );
    insertConfig.run(
      '我的个人后端',
      'private',
      'devuser',
      'backend',
      'npm run server:dev',
      projectRoot,
      3002,
      'http://localhost:3002/api/health',
      30
    );
  }
}

function _columnExists(tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
  return rows.some((r) => r.name === columnName);
}

function _migrateExportBatches(): void {
  const columnsToAdd = [
    { name: 'file_sha256', def: 'TEXT' },
    { name: 'file_size_bytes', def: 'INTEGER' },
    { name: 'file_row_count', def: 'INTEGER' },
    { name: 'verification_status', def: "TEXT NOT NULL DEFAULT 'pending'" },
    { name: 'retry_of_id', def: 'INTEGER REFERENCES export_batches(id)' },
    { name: 'recovered_at', def: 'TEXT' },
  ];
  for (const col of columnsToAdd) {
    if (!_columnExists('export_batches', col.name)) {
      try {
        db.prepare(`ALTER TABLE export_batches ADD COLUMN ${col.name} ${col.def}`).run();
      } catch (e) {
        console.warn(`迁移列 ${col.name} 失败:`, e);
      }
    }
  }
}

function _addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function generateTicketNo(): string {
  const year = new Date().getFullYear();
  const row = db.prepare('SELECT COUNT(*) as c FROM tickets WHERE ticket_no LIKE ?').get(`WO-${year}-%`) as { c: number };
  const seq = String(row.c + 1).padStart(4, '0');
  return `WO-${year}-${seq}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function generateBatchNo(): string {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const day = String(new Date().getDate()).padStart(2, '0');
  const prefix = `EXP-${year}${month}${day}`;
  const row = db.prepare('SELECT COUNT(*) as c FROM export_batches WHERE batch_no LIKE ?').get(`${prefix}%`) as { c: number };
  const seq = String(row.c + 1).padStart(4, '0');
  return `${prefix}-${seq}`;
}
