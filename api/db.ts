import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

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

    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_technician ON tickets(technician_id);
    CREATE INDEX IF NOT EXISTS idx_audit_ticket ON audit_logs(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_notes_ticket ON notes(ticket_id);
  `);

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
