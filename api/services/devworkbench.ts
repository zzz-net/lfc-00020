import { db, now } from '../db.js';
import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import type {
  User,
  LaunchConfig,
  VerificationRecord,
  TimelineEvent,
  PortCheckResult,
  LaunchStatus,
  VerificationStepStatus,
  ServiceType,
  LaunchConfigScope,
} from '../../shared/types.js';

const runningProcesses = new Map<number, ChildProcess>();

function _rowToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

function _rowToConfig(row: any): LaunchConfig {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    ownerUsername: row.owner_username,
    serviceType: row.service_type,
    command: row.command,
    cwd: row.cwd,
    fixedPort: row.fixed_port,
    healthCheckUrl: row.health_check_url,
    startupTimeoutSec: row.startup_timeout_sec,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function _rowToVerification(row: any): VerificationRecord {
  let timeline: TimelineEvent[] = [];
  try {
    timeline = JSON.parse(row.timeline || '[]');
  } catch {
    timeline = [];
  }
  return {
    id: row.id,
    configId: row.config_id,
    configName: row.config_name,
    operatorUsername: row.operator_username,
    pid: row.pid,
    actualPort: row.actual_port,
    status: row.status,
    pageCheckStatus: row.page_check_status,
    apiCheckStatus: row.api_check_status,
    failureReason: row.failure_reason,
    timeline,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function getUserByUsername(username: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  return row ? _rowToUser(row) : null;
}

export function isAdmin(username: string): boolean {
  const user = getUserByUsername(username);
  return user?.role === 'admin';
}

export function canModifyConfig(username: string, config: LaunchConfig): boolean {
  if (isAdmin(username)) return true;
  if (config.scope === 'public') return false;
  return config.ownerUsername === username;
}

export function listConfigs(username: string): LaunchConfig[] {
  const rows = db
    .prepare(
      `SELECT * FROM launch_configs 
       WHERE is_active = 1 AND (scope = 'public' OR owner_username = ?)
       ORDER BY scope DESC, created_at DESC`
    )
    .all(username);
  return rows.map(_rowToConfig);
}

export function getConfigById(id: number): LaunchConfig | null {
  const row = db.prepare('SELECT * FROM launch_configs WHERE id = ?').get(id);
  return row ? _rowToConfig(row) : null;
}

export function createConfig(params: {
  name: string;
  scope: LaunchConfigScope;
  ownerUsername: string;
  serviceType: ServiceType;
  command: string;
  cwd: string;
  fixedPort: number;
  healthCheckUrl: string;
  startupTimeoutSec: number;
}): LaunchConfig {
  const info = db
    .prepare(
      `INSERT INTO launch_configs (
        name, scope, owner_username, service_type, command, cwd,
        fixed_port, health_check_url, startup_timeout_sec, is_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(
      params.name,
      params.scope,
      params.ownerUsername,
      params.serviceType,
      params.command,
      params.cwd,
      params.fixedPort,
      params.healthCheckUrl,
      params.startupTimeoutSec,
      now(),
      now()
    );
  return getConfigById(Number(info.lastInsertRowid))!;
}

export function updateConfig(
  id: number,
  params: Partial<{
    name: string;
    scope: LaunchConfigScope;
    serviceType: ServiceType;
    command: string;
    cwd: string;
    fixedPort: number;
    healthCheckUrl: string;
    startupTimeoutSec: number;
  }>
): LaunchConfig | null {
  const existing = getConfigById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: any[] = [];
  const mapping: Record<string, string> = {
    name: 'name',
    scope: 'scope',
    serviceType: 'service_type',
    command: 'command',
    cwd: 'cwd',
    fixedPort: 'fixed_port',
    healthCheckUrl: 'health_check_url',
    startupTimeoutSec: 'startup_timeout_sec',
  };

  for (const [key, col] of Object.entries(mapping)) {
    if (params[key as keyof typeof params] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(params[key as keyof typeof params]);
    }
  }
  fields.push('updated_at = ?');
  values.push(now());
  values.push(id);

  db.prepare(`UPDATE launch_configs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getConfigById(id);
}

export function deleteConfig(id: number): boolean {
  const info = db.prepare('UPDATE launch_configs SET is_active = 0 WHERE id = ?').run(id);
  return info.changes > 0;
}

export function getLastSuccessfulConfig(username: string, serviceType?: ServiceType): LaunchConfig | null {
  let sql = `
    SELECT lc.* FROM launch_configs lc
    INNER JOIN verification_records vr ON vr.config_id = lc.id
    WHERE vr.status = 'success' AND vr.operator_username = ?
  `;
  const params: any[] = [username];
  if (serviceType) {
    sql += ' AND lc.service_type = ?';
    params.push(serviceType);
  }
  sql += ' ORDER BY vr.completed_at DESC LIMIT 1';
  const row = db.prepare(sql).get(...params);
  return row ? _rowToConfig(row) : null;
}

export async function checkPort(port: number): Promise<PortCheckResult> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve({
          port,
          isAvailable: false,
          suggestion: `端口 ${port} 已被占用，请更换端口或停止占用该端口的进程`,
        });
      } else {
        resolve({
          port,
          isAvailable: false,
          suggestion: `端口检查出错: ${err.message}`,
        });
      }
    });
    server.once('listening', () => {
      server.close();
      resolve({
        port,
        isAvailable: true,
      });
    });
    server.listen(port, '127.0.0.1');
  });
}

export function isPortInUseByConfig(configId: number): boolean {
  for (const [pid] of runningProcesses) {
    const rec = db
      .prepare(
        `SELECT * FROM verification_records 
         WHERE pid = ? AND config_id = ? AND status IN ('starting', 'running', 'verifying', 'success')
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(pid, configId);
    if (rec) return true;
  }
  return false;
}

function _addTimelineEvent(
  recordId: number,
  event: string,
  detail?: string
): void {
  const row = db.prepare('SELECT timeline FROM verification_records WHERE id = ?').get(recordId) as { timeline?: string } | undefined;
  let timeline: TimelineEvent[] = [];
  try {
    timeline = JSON.parse(row?.timeline || '[]');
  } catch {
    timeline = [];
  }
  timeline.push({
    timestamp: now(),
    event,
    detail,
  });
  db.prepare('UPDATE verification_records SET timeline = ? WHERE id = ?').run(
    JSON.stringify(timeline),
    recordId
  );
}

function _updateVerificationStatus(
  recordId: number,
  updates: Partial<{
    status: LaunchStatus;
    pageCheckStatus: VerificationStepStatus;
    apiCheckStatus: VerificationStepStatus;
    failureReason: string;
    pid: number;
    actualPort: number;
    durationMs: number;
    completedAt: string;
  }>
): void {
  const fields: string[] = [];
  const values: any[] = [];
  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      const col = key === 'pageCheckStatus'
        ? 'page_check_status'
        : key === 'apiCheckStatus'
        ? 'api_check_status'
        : key === 'failureReason'
        ? 'failure_reason'
        : key === 'actualPort'
        ? 'actual_port'
        : key === 'durationMs'
        ? 'duration_ms'
        : key === 'completedAt'
        ? 'completed_at'
        : key;
      fields.push(`${col} = ?`);
      values.push(val);
    }
  }
  values.push(recordId);
  db.prepare(`UPDATE verification_records SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function createVerificationRecord(params: {
  configId: number;
  configName: string;
  operatorUsername: string;
}): VerificationRecord {
  const info = db
    .prepare(
      `INSERT INTO verification_records (
        config_id, config_name, operator_username, status,
        page_check_status, api_check_status, timeline, created_at
      ) VALUES (?, ?, ?, 'idle', 'pending', 'pending', ?, ?)`
    )
    .run(params.configId, params.configName, params.operatorUsername, '[]', now());
  return getVerificationById(Number(info.lastInsertRowid))!;
}

export function getVerificationById(id: number): VerificationRecord | null {
  const row = db.prepare('SELECT * FROM verification_records WHERE id = ?').get(id);
  return row ? _rowToVerification(row) : null;
}

export function listVerifications(configId?: number, limit: number = 20): VerificationRecord[] {
  let sql = 'SELECT * FROM verification_records';
  const params: any[] = [];
  if (configId !== undefined) {
    sql += ' WHERE config_id = ?';
    params.push(configId);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params);
  return rows.map(_rowToVerification);
}

async function _httpGet(url: string, timeoutMs: number): Promise<{ ok: boolean; status?: number; error?: string }> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    import('http')
      .then((http) => {
        const req = http.get(url, { signal: controller.signal as any }, (res) => {
          clearTimeout(timer);
          resolve({ ok: res.statusCode === 200, status: res.statusCode });
        });
        req.on('error', (err) => {
          clearTimeout(timer);
          resolve({ ok: false, error: (err as Error).message });
        });
      })
      .catch((err) => {
        clearTimeout(timer);
        resolve({ ok: false, error: String(err) });
      });
  });
}

async function _pollHealthCheck(
  url: string,
  timeoutSec: number,
  intervalMs: number = 1000
): Promise<{ ok: boolean; error?: string }> {
  const endAt = Date.now() + timeoutSec * 1000;
  let lastError: string | undefined;
  while (Date.now() < endAt) {
    const result = await _httpGet(url, 2000);
    if (result.ok) {
      return { ok: true };
    }
    lastError = result.error || `HTTP ${result.status}`;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, error: lastError || '超时未响应' };
}

export async function launchAndVerify(
  config: LaunchConfig,
  operatorUsername: string
): Promise<VerificationRecord> {
  const startTime = Date.now();
  const record = createVerificationRecord({
    configId: config.id,
    configName: config.name,
    operatorUsername,
  });

  _updateVerificationStatus(record.id, { status: 'starting' });
  _addTimelineEvent(record.id, '开始启动流程', `配置: ${config.name}, 端口: ${config.fixedPort}`);

  const portCheck = await checkPort(config.fixedPort);
  if (!portCheck.isAvailable) {
    _updateVerificationStatus(record.id, {
      status: 'failed',
      failureReason: `端口 ${config.fixedPort} 已被占用`,
      durationMs: Date.now() - startTime,
      completedAt: now(),
    });
    _addTimelineEvent(record.id, '端口检查失败', portCheck.suggestion);
    return getVerificationById(record.id)!;
  }
  _addTimelineEvent(record.id, '端口检查通过', `端口 ${config.fixedPort} 可用`);

  let child: ChildProcess;
  try {
    const shellCmd = process.platform === 'win32' ? 'cmd.exe' : 'sh';
    const shellArgs = process.platform === 'win32' ? ['/c', config.command] : ['-c', config.command];
    child = spawn(shellCmd, shellArgs, {
      cwd: config.cwd,
      env: {
        ...process.env,
        PORT: String(config.fixedPort),
      },
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
  } catch (e: any) {
    _updateVerificationStatus(record.id, {
      status: 'failed',
      failureReason: `启动进程失败: ${e.message}`,
      durationMs: Date.now() - startTime,
      completedAt: now(),
    });
    _addTimelineEvent(record.id, '进程启动失败', e.message);
    return getVerificationById(record.id)!;
  }

  runningProcesses.set(child.pid!, child);
  _updateVerificationStatus(record.id, {
    pid: child.pid!,
    actualPort: config.fixedPort,
    status: 'running',
  });
  _addTimelineEvent(record.id, '进程已启动', `PID: ${child.pid}`);

  _updateVerificationStatus(record.id, { status: 'verifying' });
  _addTimelineEvent(record.id, '开始健康检查', `URL: ${config.healthCheckUrl}`);

  let pageOk = false;
  let apiOk = false;
  let pageError: string | undefined;
  let apiError: string | undefined;

  if (config.serviceType === 'frontend') {
    _updateVerificationStatus(record.id, { pageCheckStatus: 'running' });
    const pageResult = await _pollHealthCheck(config.healthCheckUrl, config.startupTimeoutSec);
    pageOk = pageResult.ok;
    pageError = pageResult.error;
    _updateVerificationStatus(record.id, {
      pageCheckStatus: pageOk ? 'success' : 'failed',
    });
    _addTimelineEvent(
      record.id,
      pageOk ? '页面探活通过' : '页面探活失败',
      pageOk ? undefined : pageError
    );
  } else {
    pageOk = true;
    _updateVerificationStatus(record.id, { pageCheckStatus: 'success' });
    _addTimelineEvent(record.id, '跳过页面探活', '后端服务');
  }

  if (config.serviceType === 'backend') {
    _updateVerificationStatus(record.id, { apiCheckStatus: 'running' });
    const apiResult = await _pollHealthCheck(config.healthCheckUrl, config.startupTimeoutSec);
    apiOk = apiResult.ok;
    apiError = apiResult.error;
    _updateVerificationStatus(record.id, {
      apiCheckStatus: apiOk ? 'success' : 'failed',
    });
    _addTimelineEvent(
      record.id,
      apiOk ? '接口探活通过' : '接口探活失败',
      apiOk ? undefined : apiError
    );
  } else {
    apiOk = true;
    _updateVerificationStatus(record.id, { apiCheckStatus: 'success' });
    _addTimelineEvent(record.id, '跳过接口探活', '前端服务');
  }

  const allOk = pageOk && apiOk;
  _updateVerificationStatus(record.id, {
    status: allOk ? 'success' : 'failed',
    failureReason: allOk ? undefined : `验真失败: ${pageError || apiError || '未知原因'}`,
    durationMs: Date.now() - startTime,
    completedAt: now(),
  });
  _addTimelineEvent(
    record.id,
    allOk ? '启动验真成功' : '启动验真失败',
    allOk ? undefined : `页面:${pageOk ? 'PASS' : 'FAIL'}, API:${apiOk ? 'PASS' : 'FAIL'}`
  );

  return getVerificationById(record.id)!;
}

export function stopService(pid: number): boolean {
  const child = runningProcesses.get(pid);
  if (child && !child.killed) {
    try {
      child.kill('SIGTERM');
      runningProcesses.delete(pid);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function getRunningPids(): number[] {
  return Array.from(runningProcesses.keys()).filter((pid) => {
    const child = runningProcesses.get(pid);
    return child && !child.killed;
  });
}

export function listUsers(): User[] {
  const rows = db.prepare('SELECT * FROM users ORDER BY id').all();
  return rows.map(_rowToUser);
}
