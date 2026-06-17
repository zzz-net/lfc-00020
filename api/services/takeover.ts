import { db, now } from '../db.js';
import { spawn, ChildProcess, exec } from 'child_process';
import * as net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  TakeoverPlan,
  TakeoverReceipt,
  TakeoverPlanScope,
  TakeoverAction,
  TakeoverReceiptStatus,
  CheckStatus,
  CheckDetail,
  PortOccupierInfo,
  TimelineEvent,
  TakeoverPlanExport,
  User,
} from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');

const runningProcesses = new Map<number, { process: ChildProcess; planId: number }>();

function _rowToPlan(row: any): TakeoverPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    scope: row.scope,
    ownerUsername: row.owner_username,
    frontendCommand: row.frontend_command || undefined,
    backendCommand: row.backend_command || undefined,
    expectedPort: row.expected_port,
    homePageUrl: row.home_page_url,
    apiHealthUrl: row.api_health_url,
    timeoutSec: row.timeout_sec,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function _rowToReceipt(row: any): TakeoverReceipt {
  let portOccupier: PortOccupierInfo | undefined;
  let homePageCheck: CheckDetail = { status: 'pending' };
  let apiHealthCheck: CheckDetail = { status: 'pending' };
  let processOwnershipCheck: CheckDetail = { status: 'pending' };
  let timeline: TimelineEvent[] = [];

  try {
    if (row.port_occupier) portOccupier = JSON.parse(row.port_occupier);
  } catch {}
  try {
    if (row.home_page_check) homePageCheck = JSON.parse(row.home_page_check);
  } catch {}
  try {
    if (row.api_health_check) apiHealthCheck = JSON.parse(row.api_health_check);
  } catch {}
  try {
    if (row.process_ownership_check) processOwnershipCheck = JSON.parse(row.process_ownership_check);
  } catch {}
  try {
    if (row.timeline) timeline = JSON.parse(row.timeline);
  } catch {}

  return {
    id: row.id,
    planId: row.plan_id,
    planName: row.plan_name,
    action: row.action,
    operatorUsername: row.operator_username,
    status: row.status,
    portOccupier,
    homePageCheck,
    apiHealthCheck,
    processOwnershipCheck,
    conflictDescription: row.conflict_description || undefined,
    handlingSuggestion: row.handling_suggestion || undefined,
    actualPid: row.actual_pid || undefined,
    actualPort: row.actual_port || undefined,
    timeline,
    durationMs: row.duration_ms || undefined,
    undoOfId: row.undo_of_id || undefined,
    isUndone: !!row.is_undone,
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
  };
}

function _getUserByUsername(username: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
  return row
    ? {
        id: row.id,
        username: row.username,
        role: row.role,
        displayName: row.display_name,
        createdAt: row.created_at,
      }
    : null;
}

export function isAdmin(username: string): boolean {
  const user = _getUserByUsername(username);
  return user?.role === 'admin';
}

export function canModifyPlan(username: string, plan: TakeoverPlan): boolean {
  if (isAdmin(username)) return true;
  if (plan.scope === 'public') return false;
  return plan.ownerUsername === username;
}

export function listPlans(username: string): TakeoverPlan[] {
  const rows = db
    .prepare(
      `SELECT * FROM takeover_plans 
       WHERE is_active = 1 AND (scope = 'public' OR owner_username = ?)
       ORDER BY scope DESC, created_at DESC`
    )
    .all(username);
  return rows.map(_rowToPlan);
}

export function getPlanById(id: number): TakeoverPlan | null {
  const row = db.prepare('SELECT * FROM takeover_plans WHERE id = ?').get(id);
  return row ? _rowToPlan(row) : null;
}

export function createPlan(params: {
  name: string;
  description?: string;
  scope: TakeoverPlanScope;
  ownerUsername: string;
  frontendCommand?: string;
  backendCommand?: string;
  expectedPort: number;
  homePageUrl: string;
  apiHealthUrl: string;
  timeoutSec: number;
}): TakeoverPlan {
  const info = db
    .prepare(
      `INSERT INTO takeover_plans (
        name, description, scope, owner_username,
        frontend_command, backend_command, expected_port,
        home_page_url, api_health_url, timeout_sec, is_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(
      params.name,
      params.description || null,
      params.scope,
      params.ownerUsername,
      params.frontendCommand || null,
      params.backendCommand || null,
      params.expectedPort,
      params.homePageUrl,
      params.apiHealthUrl,
      params.timeoutSec,
      now(),
      now()
    );
  return getPlanById(Number(info.lastInsertRowid))!;
}

export function updatePlan(
  id: number,
  params: Partial<{
    name: string;
    description: string;
    scope: TakeoverPlanScope;
    frontendCommand: string;
    backendCommand: string;
    expectedPort: number;
    homePageUrl: string;
    apiHealthUrl: string;
    timeoutSec: number;
  }>
): TakeoverPlan | null {
  const existing = getPlanById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: any[] = [];
  const mapping: Record<string, string> = {
    name: 'name',
    description: 'description',
    scope: 'scope',
    frontendCommand: 'frontend_command',
    backendCommand: 'backend_command',
    expectedPort: 'expected_port',
    homePageUrl: 'home_page_url',
    apiHealthUrl: 'api_health_url',
    timeoutSec: 'timeout_sec',
  };

  for (const [key, col] of Object.entries(mapping)) {
    const val = params[key as keyof typeof params];
    if (val !== undefined) {
      fields.push(`${col} = ?`);
      values.push(val === '' ? null : val);
    }
  }
  fields.push('updated_at = ?');
  values.push(now());
  values.push(id);

  db.prepare(`UPDATE takeover_plans SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getPlanById(id);
}

export function deletePlan(id: number): boolean {
  const info = db.prepare('UPDATE takeover_plans SET is_active = 0 WHERE id = ?').run(id);
  return info.changes > 0;
}

async function _getProcessByPid(pid: number): Promise<{
  processName?: string;
  processPath?: string;
  commandLine?: string;
}> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(
        `powershell -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object Name, ExecutablePath, CommandLine | ConvertTo-Json"`,
        { timeout: 3000 },
        (err, stdout) => {
          if (err) {
            resolve({});
            return;
          }
          try {
            const data = JSON.parse(stdout.trim());
            if (Array.isArray(data) && data.length > 0) {
              resolve({
                processName: data[0].Name,
                processPath: data[0].ExecutablePath,
                commandLine: data[0].CommandLine,
              });
            } else if (data && !Array.isArray(data)) {
              resolve({
                processName: data.Name,
                processPath: data.ExecutablePath,
                commandLine: data.CommandLine,
              });
            } else {
              resolve({});
            }
          } catch {
            resolve({});
          }
        }
      );
    } else {
      exec(`ps -p ${pid} -o comm=,args=`, { timeout: 3000 }, (err, stdout) => {
        if (err) {
          resolve({});
          return;
        }
        const lines = stdout.trim().split('\n');
        if (lines.length > 0) {
          const parts = lines[0].trim().split(/\s+/);
          resolve({
            processName: parts[0],
            commandLine: lines[0],
          });
        } else {
          resolve({});
        }
      });
    }
  });
}

async function _getPortPid(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`netstat -ano | findstr ":${port} " | findstr "LISTENING"`, { timeout: 3000 }, (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(null);
          return;
        }
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const match = line.trim().match(/\s+(\d+)\s*$/);
          if (match) {
            resolve(Number(match[1]));
            return;
          }
        }
        resolve(null);
      });
    } else {
      exec(`lsof -ti:${port} -sTCP:LISTEN`, { timeout: 3000 }, (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(null);
          return;
        }
        const lines = stdout.trim().split('\n');
        resolve(lines.length > 0 ? Number(lines[0].trim()) : null);
      });
    }
  });
}

export async function getPortOccupier(port: number): Promise<PortOccupierInfo> {
  const pid = await _getPortPid(port);
  if (!pid) {
    return {
      port,
      isOccupied: false,
      suggestion: `端口 ${port} 空闲可用`,
    };
  }

  const procInfo = await _getProcessByPid(pid);
  const normalizedRoot = projectRoot.replace(/\\/g, '/').toLowerCase();
  const cmdLine = (procInfo.commandLine || '').replace(/\\/g, '/').toLowerCase();
  const procPath = (procInfo.processPath || '').replace(/\\/g, '/').toLowerCase();
  const belongsToWorkspace = cmdLine.includes(normalizedRoot) || procPath.includes(normalizedRoot);

  let suggestion = '';
  if (belongsToWorkspace) {
    suggestion = `端口 ${port} 被本项目进程 (PID: ${pid}) 占用，可能是之前启动的服务，可尝试复用或停止后再启动`;
  } else {
    suggestion = `端口 ${port} 被外部进程 (PID: ${pid}, 名称: ${procInfo.processName || '未知'}) 占用，请更换端口或终止该进程`;
  }

  return {
    port,
    isOccupied: true,
    pid,
    processName: procInfo.processName,
    processPath: procInfo.processPath,
    commandLine: procInfo.commandLine,
    belongsToWorkspace,
    suggestion,
  };
}

async function _httpGet(url: string, timeoutMs: number): Promise<{ ok: boolean; status?: number; error?: string; responseTimeMs?: number }> {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    import('http')
      .then((http) => {
        const req = http.get(url, { signal: controller.signal as any }, (res) => {
          clearTimeout(timer);
          resolve({
            ok: res.statusCode === 200,
            status: res.statusCode,
            responseTimeMs: Date.now() - startTime,
          });
        });
        req.on('error', (err) => {
          clearTimeout(timer);
          resolve({
            ok: false,
            error: (err as Error).message,
            responseTimeMs: Date.now() - startTime,
          });
        });
      })
      .catch((err) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          error: String(err),
          responseTimeMs: Date.now() - startTime,
        });
      });
  });
}

async function _pollCheck(
  url: string,
  timeoutSec: number,
  intervalMs: number = 1000
): Promise<{ ok: boolean; status?: number; error?: string; responseTimeMs?: number }> {
  const endAt = Date.now() + timeoutSec * 1000;
  let lastResult: { ok: boolean; status?: number; error?: string; responseTimeMs?: number } = { ok: false, error: '未执行检测' };
  while (Date.now() < endAt) {
    lastResult = await _httpGet(url, 3000);
    if (lastResult.ok) {
      return lastResult;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return lastResult;
}

function _addTimelineEvent(receiptId: number, event: string, detail?: string): void {
  const row = db.prepare('SELECT timeline FROM takeover_receipts WHERE id = ?').get(receiptId) as { timeline?: string } | undefined;
  let timeline: TimelineEvent[] = [];
  try {
    timeline = JSON.parse(row?.timeline || '[]');
  } catch {
    timeline = [];
  }
  timeline.push({ timestamp: now(), event, detail });
  db.prepare('UPDATE takeover_receipts SET timeline = ? WHERE id = ?').run(JSON.stringify(timeline), receiptId);
}

function _updateReceipt(
  receiptId: number,
  updates: Partial<{
    status: TakeoverReceiptStatus;
    portOccupier: PortOccupierInfo;
    homePageCheck: CheckDetail;
    apiHealthCheck: CheckDetail;
    processOwnershipCheck: CheckDetail;
    conflictDescription: string;
    handlingSuggestion: string;
    actualPid: number;
    actualPort: number;
    durationMs: number;
    completedAt: string;
    isUndone: boolean;
    undoOfId: number;
  }>
): void {
  const fields: string[] = [];
  const values: any[] = [];
  const colMap: Record<string, string> = {
    status: 'status',
    portOccupier: 'port_occupier',
    homePageCheck: 'home_page_check',
    apiHealthCheck: 'api_health_check',
    processOwnershipCheck: 'process_ownership_check',
    conflictDescription: 'conflict_description',
    handlingSuggestion: 'handling_suggestion',
    actualPid: 'actual_pid',
    actualPort: 'actual_port',
    durationMs: 'duration_ms',
    completedAt: 'completed_at',
    isUndone: 'is_undone',
    undoOfId: 'undo_of_id',
  };

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      const col = colMap[key];
      if (col) {
        fields.push(`${col} = ?`);
        if (typeof val === 'object' && val !== null) {
          values.push(JSON.stringify(val));
        } else {
          values.push(val);
        }
      }
    }
  }
  values.push(receiptId);
  db.prepare(`UPDATE takeover_receipts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function _createReceipt(params: {
  planId: number;
  planName: string;
  action: TakeoverAction;
  operatorUsername: string;
}): TakeoverReceipt {
  const defaultCheck: CheckDetail = { status: 'pending' };
  const info = db
    .prepare(
      `INSERT INTO takeover_receipts (
        plan_id, plan_name, action, operator_username, status,
        home_page_check, api_health_check, process_ownership_check,
        timeline, is_undone, created_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, '[]', 0, ?)`
    )
    .run(
      params.planId,
      params.planName,
      params.action,
      params.operatorUsername,
      JSON.stringify(defaultCheck),
      JSON.stringify(defaultCheck),
      JSON.stringify(defaultCheck),
      now()
    );
  return getReceiptById(Number(info.lastInsertRowid))!;
}

export function getReceiptById(id: number): TakeoverReceipt | null {
  const row = db.prepare('SELECT * FROM takeover_receipts WHERE id = ?').get(id);
  return row ? _rowToReceipt(row) : null;
}

export function listReceipts(planId?: number, limit: number = 50): TakeoverReceipt[] {
  let sql = 'SELECT * FROM takeover_receipts';
  const params: any[] = [];
  if (planId !== undefined) {
    sql += ' WHERE plan_id = ?';
    params.push(planId);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params);
  return rows.map(_rowToReceipt);
}

export function getLastReceipt(username?: string): TakeoverReceipt | null {
  let sql = 'SELECT * FROM takeover_receipts';
  const params: any[] = [];
  if (username) {
    sql += ' WHERE operator_username = ?';
    params.push(username);
  }
  sql += ' ORDER BY created_at DESC LIMIT 1';
  const row = db.prepare(sql).get(...params);
  return row ? _rowToReceipt(row) : null;
}

function _buildConflictAndSuggestion(
  action: TakeoverAction,
  portOccupier: PortOccupierInfo,
  homePageCheck: CheckDetail,
  apiHealthCheck: CheckDetail,
  processOwnershipCheck: CheckDetail
): { conflictDescription: string; handlingSuggestion: string } {
  const conflicts: string[] = [];
  const suggestions: string[] = [];

  if (portOccupier.isOccupied) {
    if (portOccupier.belongsToWorkspace) {
      conflicts.push(`端口 ${portOccupier.port} 被本项目进程 PID:${portOccupier.pid} 占用`);
      if (action === 'launch') {
        suggestions.push(`可尝试使用"复用"操作接管现有进程，或先停止该进程再重新启动`);
      }
    } else if (portOccupier.belongsToWorkspace === false) {
      conflicts.push(
        `端口 ${portOccupier.port} 被外部进程 PID:${portOccupier.pid} (${portOccupier.processName || '未知进程'}) 占用`
      );
      suggestions.push(`请更换端口，或手动终止 PID:${portOccupier.pid} 后重试`);
    } else {
      conflicts.push(
        `端口 ${portOccupier.port} 被进程 PID:${portOccupier.pid} (${portOccupier.processName || '未知进程'}) 占用，归属未确认`
      );
      suggestions.push(`端口被占用但进程归属无法判定，请手动检查 PID:${portOccupier.pid} 是否属于当前项目后再操作`);
    }
  }

  if (homePageCheck.status === 'failed') {
    conflicts.push(`首页访问失败: ${homePageCheck.message || `HTTP ${homePageCheck.httpStatus}`}`);
    if (homePageCheck.httpStatus === 404) {
      suggestions.push(`首页返回 404，请检查首页地址配置是否正确，或前端服务是否已正确启动`);
    } else if (homePageCheck.message) {
      suggestions.push(`首页无法连接，请确认服务已启动且地址端口匹配`);
    }
  } else if (homePageCheck.status === 'pending') {
    conflicts.push('首页检测未完成');
    suggestions.push('首页检测未执行完毕，请检查服务是否正常启动后重试');
  }

  if (apiHealthCheck.status === 'failed') {
    conflicts.push(`API 健康检查失败: ${apiHealthCheck.message || `HTTP ${apiHealthCheck.httpStatus}`}`);
    suggestions.push(`API 健康检查未通过，请检查 API 地址配置和后端服务运行状态`);
  } else if (apiHealthCheck.status === 'pending') {
    conflicts.push('API 健康检测未完成');
    suggestions.push('API 健康检测未执行完毕，请检查后端服务是否正常运行后重试');
  }

  if (processOwnershipCheck.status === 'failed') {
    conflicts.push(`进程归属校验失败: ${processOwnershipCheck.message || '进程不属于当前项目工作空间'}`);
    suggestions.push(`检测到占用端口的进程不属于当前项目，为避免误杀，请手动确认后处理`);
  } else if (processOwnershipCheck.status === 'pending') {
    conflicts.push(`进程归属校验未完成: ${processOwnershipCheck.message || '归属状态待确认'}`);
    suggestions.push(`进程归属校验未完成，无法确认接管结果，请检查端口上的进程是否属于当前项目后重试`);
  } else if (processOwnershipCheck.status === 'skipped' && action !== 'stop') {
    conflicts.push(`进程归属校验被跳过: ${processOwnershipCheck.message || '未执行归属校验'}`);
    suggestions.push(`进程归属校验被跳过，无法确认接管结果，请手动检查后重试`);
  }

  return {
    conflictDescription: conflicts.join('；'),
    handlingSuggestion: suggestions.join('；'),
  };
}

function _spawnDetached(command: string, cwd: string, portEnv?: number): ChildProcess {
  const shellCmd = process.platform === 'win32' ? 'cmd.exe' : 'sh';
  const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-c', command];
  const env: Record<string, string> = { ...process.env };
  if (portEnv) {
    env.PORT = String(portEnv);
  }
  const child = spawn(shellCmd, shellArgs, {
    cwd,
    env,
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
  return child;
}

export async function executeTakeover(
  plan: TakeoverPlan,
  action: TakeoverAction,
  operatorUsername: string
): Promise<TakeoverReceipt> {
  const startTime = Date.now();
  const receipt = _createReceipt({
    planId: plan.id,
    planName: plan.name,
    action,
    operatorUsername,
  });

  _updateReceipt(receipt.id, { status: 'running' });
  _addTimelineEvent(receipt.id, `开始${action === 'launch' ? '启动' : action === 'reuse' ? '复用' : '停止'}接管`, `方案: ${plan.name}, 预期端口: ${plan.expectedPort}`);

  let portOccupier: PortOccupierInfo;
  let homePageCheck: CheckDetail = { status: 'pending' };
  let apiHealthCheck: CheckDetail = { status: 'pending' };
  let processOwnershipCheck: CheckDetail = { status: 'pending' };
  let actualPid: number | undefined;
  let actualPort: number | undefined;

  _addTimelineEvent(receipt.id, '步骤 1/4: 检测端口占用', `端口: ${plan.expectedPort}`);
  portOccupier = await getPortOccupier(plan.expectedPort);
  _updateReceipt(receipt.id, { portOccupier });

  if (portOccupier.isOccupied) {
    _addTimelineEvent(
      receipt.id,
      '端口占用检测结果',
      `PID:${portOccupier.pid}, 进程:${portOccupier.processName || '未知'}, 归属:${portOccupier.belongsToWorkspace ? '本项目' : '外部'}`
    );
  } else {
    _addTimelineEvent(receipt.id, '端口占用检测结果', '端口空闲');
  }

  if (action === 'stop') {
    if (!portOccupier.isOccupied || !portOccupier.pid) {
      const { conflictDescription, handlingSuggestion } = _buildConflictAndSuggestion(
        action,
        portOccupier,
        { status: 'skipped' },
        { status: 'skipped' },
        { status: 'skipped' }
      );
      _updateReceipt(receipt.id, {
        status: 'failed',
        homePageCheck: { status: 'skipped', message: '停止操作无需检测' },
        apiHealthCheck: { status: 'skipped', message: '停止操作无需检测' },
        processOwnershipCheck: { status: 'skipped', message: '停止操作无需检测' },
        conflictDescription: conflictDescription || `端口 ${plan.expectedPort} 当前无进程运行，无需停止`,
        handlingSuggestion: handlingSuggestion || '无需执行停止操作',
        durationMs: Date.now() - startTime,
        completedAt: now(),
      });
      _addTimelineEvent(receipt.id, '停止失败', `端口 ${plan.expectedPort} 空闲，无进程可停止`);
      return getReceiptById(receipt.id)!;
    }

    if (!portOccupier.belongsToWorkspace) {
      processOwnershipCheck = {
        status: 'failed',
        message: '占用端口的进程不属于当前项目',
      };
      const { conflictDescription, handlingSuggestion } = _buildConflictAndSuggestion(
        action,
        portOccupier,
        { status: 'skipped' },
        { status: 'skipped' },
        processOwnershipCheck
      );
      _updateReceipt(receipt.id, {
        status: 'failed',
        homePageCheck: { status: 'skipped' },
        apiHealthCheck: { status: 'skipped' },
        processOwnershipCheck,
        conflictDescription,
        handlingSuggestion,
        durationMs: Date.now() - startTime,
        completedAt: now(),
      });
      _addTimelineEvent(receipt.id, '停止失败', '进程归属校验未通过，为避免误杀已中止操作');
      return getReceiptById(receipt.id)!;
    }

    processOwnershipCheck = { status: 'success', message: '进程归属校验通过' };
    _addTimelineEvent(receipt.id, '步骤 2/4: 进程归属校验通过', `PID:${portOccupier.pid} 属于当前项目`);

    const tracked = runningProcesses.get(portOccupier.pid);
    if (tracked) {
      try {
        tracked.process.kill('SIGTERM');
      } catch {}
      runningProcesses.delete(portOccupier.pid);
    } else {
      try {
        process.kill(portOccupier.pid, 'SIGTERM');
      } catch (e: any) {
        const { conflictDescription, handlingSuggestion } = _buildConflictAndSuggestion(
          action,
          portOccupier,
          { status: 'skipped' },
          { status: 'skipped' },
          { status: 'failed', message: `终止进程失败: ${e.message}` }
        );
        _updateReceipt(receipt.id, {
          status: 'failed',
          homePageCheck: { status: 'skipped' },
          apiHealthCheck: { status: 'skipped' },
          processOwnershipCheck: { status: 'failed', message: `终止进程失败: ${e.message}` },
          conflictDescription,
          handlingSuggestion,
          durationMs: Date.now() - startTime,
          completedAt: now(),
        });
        _addTimelineEvent(receipt.id, '停止失败', `终止进程 PID:${portOccupier.pid} 失败: ${e.message}`);
        return getReceiptById(receipt.id)!;
      }
    }

    await new Promise((r) => setTimeout(r, 1000));
    const checkAfter = await getPortOccupier(plan.expectedPort);
    if (checkAfter.isOccupied) {
      const { conflictDescription, handlingSuggestion } = _buildConflictAndSuggestion(
        action,
        checkAfter,
        { status: 'skipped' },
        { status: 'skipped' },
        { status: 'failed', message: '进程终止后端口仍被占用' }
      );
      _updateReceipt(receipt.id, {
        status: 'failed',
        homePageCheck: { status: 'skipped' },
        apiHealthCheck: { status: 'skipped' },
        processOwnershipCheck: { status: 'failed', message: '进程终止后端口仍被占用' },
        conflictDescription,
        handlingSuggestion,
        actualPid: portOccupier.pid,
        actualPort: plan.expectedPort,
        durationMs: Date.now() - startTime,
        completedAt: now(),
      });
      _addTimelineEvent(receipt.id, '停止失败', '终止信号已发送但端口仍被占用');
      return getReceiptById(receipt.id)!;
    }

    _updateReceipt(receipt.id, {
      status: 'success',
      homePageCheck: { status: 'skipped', message: '停止操作无需检测' },
      apiHealthCheck: { status: 'skipped', message: '停止操作无需检测' },
      processOwnershipCheck,
      actualPid: portOccupier.pid,
      actualPort: plan.expectedPort,
      durationMs: Date.now() - startTime,
      completedAt: now(),
    });
    _addTimelineEvent(receipt.id, '停止成功', `已终止进程 PID:${portOccupier.pid}，端口 ${plan.expectedPort} 已释放`);
    return getReceiptById(receipt.id)!;
  }

  if (action === 'reuse') {
    if (!portOccupier.isOccupied || !portOccupier.pid) {
      const { conflictDescription, handlingSuggestion } = _buildConflictAndSuggestion(
        action,
        portOccupier,
        { status: 'pending' },
        { status: 'pending' },
        { status: 'failed', message: '端口空闲，无进程可复用' }
      );
      _updateReceipt(receipt.id, {
        status: 'failed',
        processOwnershipCheck: { status: 'failed', message: '端口空闲，无进程可复用' },
        conflictDescription,
        handlingSuggestion,
        durationMs: Date.now() - startTime,
        completedAt: now(),
      });
      _addTimelineEvent(receipt.id, '复用失败', `端口 ${plan.expectedPort} 空闲，无进程可复用，请先执行启动`);
      return getReceiptById(receipt.id)!;
    }

    _addTimelineEvent(receipt.id, '步骤 2/4: 校验进程归属', `PID:${portOccupier.pid}`);
    if (!portOccupier.belongsToWorkspace) {
      processOwnershipCheck = {
        status: 'failed',
        message: '占用端口的进程不属于当前项目',
      };
      const { conflictDescription, handlingSuggestion } = _buildConflictAndSuggestion(
        action,
        portOccupier,
        { status: 'skipped' },
        { status: 'skipped' },
        processOwnershipCheck
      );
      _updateReceipt(receipt.id, {
        status: 'failed',
        homePageCheck: { status: 'skipped' },
        apiHealthCheck: { status: 'skipped' },
        processOwnershipCheck,
        conflictDescription,
        handlingSuggestion,
        actualPid: portOccupier.pid,
        actualPort: plan.expectedPort,
        durationMs: Date.now() - startTime,
        completedAt: now(),
      });
      _addTimelineEvent(receipt.id, '复用失败', '进程归属校验未通过');
      return getReceiptById(receipt.id)!;
    }
    processOwnershipCheck = { status: 'success', message: '进程归属校验通过' };
    actualPid = portOccupier.pid;
    actualPort = plan.expectedPort;
    _addTimelineEvent(receipt.id, '进程归属校验通过', `PID:${portOccupier.pid} 属于当前项目`);
  }

  if (action === 'launch') {
    if (portOccupier.isOccupied) {
      const ownershipCheck: CheckDetail = portOccupier.belongsToWorkspace
        ? { status: 'failed', message: `端口被本项目进程 (PID:${portOccupier.pid}) 占用，无法启动新进程` }
        : portOccupier.belongsToWorkspace === false
          ? { status: 'failed', message: `端口被外部进程 (PID:${portOccupier.pid}, ${portOccupier.processName || '未知'}) 占用，无法启动新进程` }
          : { status: 'failed', message: `端口被进程 (PID:${portOccupier.pid}) 占用，归属未确认，无法启动新进程` };
      const { conflictDescription, handlingSuggestion } = _buildConflictAndSuggestion(
        action,
        portOccupier,
        { status: 'skipped' },
        { status: 'skipped' },
        ownershipCheck
      );
      _updateReceipt(receipt.id, {
        status: 'failed',
        homePageCheck: { status: 'skipped' },
        apiHealthCheck: { status: 'skipped' },
        processOwnershipCheck: ownershipCheck,
        conflictDescription,
        handlingSuggestion,
        durationMs: Date.now() - startTime,
        completedAt: now(),
      });
      _addTimelineEvent(receipt.id, '启动失败', `端口 ${plan.expectedPort} 已被占用，无法启动新进程`);
      return getReceiptById(receipt.id)!;
    }

    const command = plan.backendCommand || plan.frontendCommand;
    if (!command) {
      const { conflictDescription, handlingSuggestion } = _buildConflictAndSuggestion(
        action,
        portOccupier,
        { status: 'skipped' },
        { status: 'skipped' },
        { status: 'failed', message: '方案未配置启动命令' }
      );
      _updateReceipt(receipt.id, {
        status: 'failed',
        homePageCheck: { status: 'skipped' },
        apiHealthCheck: { status: 'skipped' },
        processOwnershipCheck: { status: 'failed', message: '方案未配置启动命令' },
        conflictDescription: conflictDescription || '方案未配置启动命令',
        handlingSuggestion: handlingSuggestion || '请在方案中配置前端或后端启动命令',
        durationMs: Date.now() - startTime,
        completedAt: now(),
      });
      _addTimelineEvent(receipt.id, '启动失败', '方案未配置启动命令');
      return getReceiptById(receipt.id)!;
    }

    try {
      _addTimelineEvent(receipt.id, '启动后端进程', `命令: ${command}`);
      const child = _spawnDetached(command, projectRoot, plan.expectedPort);
      actualPid = child.pid;
      actualPort = plan.expectedPort;
      runningProcesses.set(child.pid!, { process: child, planId: plan.id });
      _addTimelineEvent(receipt.id, '进程已启动', `PID: ${child.pid}`);
    } catch (e: any) {
      const { conflictDescription, handlingSuggestion } = _buildConflictAndSuggestion(
        action,
        portOccupier,
        { status: 'skipped' },
        { status: 'skipped' },
        { status: 'failed', message: `进程启动失败: ${e.message}` }
      );
      _updateReceipt(receipt.id, {
        status: 'failed',
        homePageCheck: { status: 'skipped' },
        apiHealthCheck: { status: 'skipped' },
        processOwnershipCheck: { status: 'failed', message: `进程启动失败: ${e.message}` },
        conflictDescription,
        handlingSuggestion,
        durationMs: Date.now() - startTime,
        completedAt: now(),
      });
      _addTimelineEvent(receipt.id, '启动失败', `进程启动异常: ${e.message}`);
      return getReceiptById(receipt.id)!;
    }

    const portWaitMs = Math.min((plan.timeoutSec || 15) * 1000, 15000);
    const portWaitStart = Date.now();
    let portAfterStart = await getPortOccupier(plan.expectedPort);
    while (!portAfterStart.isOccupied && Date.now() - portWaitStart < portWaitMs) {
      await new Promise((r) => setTimeout(r, 800));
      portAfterStart = await getPortOccupier(plan.expectedPort);
    }
    if (!portAfterStart.isOccupied) {
      const { conflictDescription, handlingSuggestion } = _buildConflictAndSuggestion(
        action,
        portAfterStart,
        { status: 'skipped' },
        { status: 'skipped' },
        { status: 'failed', message: '进程启动后端口未被监听，可能启动失败或使用其他端口' }
      );
      _updateReceipt(receipt.id, {
        status: 'failed',
        homePageCheck: { status: 'skipped' },
        apiHealthCheck: { status: 'skipped' },
        processOwnershipCheck: {
          status: 'failed',
          message: '进程启动后端口未被监听，可能启动失败或使用其他端口',
        },
        conflictDescription,
        handlingSuggestion,
        actualPid,
        actualPort,
        durationMs: Date.now() - startTime,
        completedAt: now(),
      });
      _addTimelineEvent(receipt.id, '启动失败', '进程启动后端口未被监听');
      return getReceiptById(receipt.id)!;
    }

    _addTimelineEvent(receipt.id, '步骤 2/4: 校验进程归属', `端口 ${plan.expectedPort} 已被占用，校验归属`);
    if (portAfterStart.belongsToWorkspace) {
      processOwnershipCheck = { status: 'success', message: `进程归属校验通过：端口 ${plan.expectedPort} 上的进程 (PID:${portAfterStart.pid}) 属于当前项目` };
      _addTimelineEvent(receipt.id, '进程归属校验通过', `PID:${portAfterStart.pid} 属于当前项目`);
      if (portAfterStart.pid) actualPid = portAfterStart.pid;
    } else {
      processOwnershipCheck = {
        status: 'failed',
        message: portAfterStart.pid
          ? `端口 ${plan.expectedPort} 被非本项目进程 (PID:${portAfterStart.pid}) 占用，启动的服务可能未正确绑定`
          : `无法确认端口 ${plan.expectedPort} 上进程的归属，进程归属校验未通过`,
      };
      _addTimelineEvent(receipt.id, '进程归属校验未通过', `PID:${portAfterStart.pid || '未知'}, 不属于当前项目`);
      const { conflictDescription, handlingSuggestion } = _buildConflictAndSuggestion(
        action,
        portAfterStart,
        { status: 'skipped' },
        { status: 'skipped' },
        processOwnershipCheck
      );
      _updateReceipt(receipt.id, {
        status: 'failed',
        homePageCheck: { status: 'skipped' },
        apiHealthCheck: { status: 'skipped' },
        processOwnershipCheck,
        conflictDescription,
        handlingSuggestion,
        actualPid,
        actualPort,
        durationMs: Date.now() - startTime,
        completedAt: now(),
      });
      _addTimelineEvent(receipt.id, '启动失败', '进程归属校验未通过，中止接管');
      return getReceiptById(receipt.id)!;
    }
  }

  _addTimelineEvent(receipt.id, '步骤 3/4: 检测首页可达性', `URL: ${plan.homePageUrl}`);
  _updateReceipt(receipt.id, {
    homePageCheck: { status: 'running' },
    actualPid,
    actualPort,
  });
  const homeResult = await _pollCheck(plan.homePageUrl, Math.min(plan.timeoutSec, 30));
  homePageCheck = {
    status: homeResult.ok ? 'success' : 'failed',
    message: homeResult.error,
    httpStatus: homeResult.status,
    responseTimeMs: homeResult.responseTimeMs,
  };
  _updateReceipt(receipt.id, { homePageCheck });
  _addTimelineEvent(
    receipt.id,
    homePageCheck.status === 'success' ? '首页检测通过' : '首页检测失败',
    homePageCheck.status === 'success'
      ? `HTTP ${homePageCheck.httpStatus}, ${homePageCheck.responseTimeMs}ms`
      : homePageCheck.httpStatus
      ? `HTTP ${homePageCheck.httpStatus}`
      : homePageCheck.message
  );

  _addTimelineEvent(receipt.id, '步骤 4/4: 检测 API 健康', `URL: ${plan.apiHealthUrl}`);
  _updateReceipt(receipt.id, { apiHealthCheck: { status: 'running' } });
  const apiResult = await _pollCheck(plan.apiHealthUrl, Math.min(plan.timeoutSec, 30));
  apiHealthCheck = {
    status: apiResult.ok ? 'success' : 'failed',
    message: apiResult.error,
    httpStatus: apiResult.status,
    responseTimeMs: apiResult.responseTimeMs,
  };
  _updateReceipt(receipt.id, { apiHealthCheck });
  _addTimelineEvent(
    receipt.id,
    apiHealthCheck.status === 'success' ? 'API 检测通过' : 'API 检测失败',
    apiHealthCheck.status === 'success'
      ? `HTTP ${apiHealthCheck.httpStatus}, ${apiHealthCheck.responseTimeMs}ms`
      : apiHealthCheck.httpStatus
      ? `HTTP ${apiHealthCheck.httpStatus}`
      : apiHealthCheck.message
  );

  const allPassed =
    homePageCheck.status === 'success' &&
    apiHealthCheck.status === 'success' &&
    processOwnershipCheck.status === 'success';

  if (!allPassed) {
    const { conflictDescription, handlingSuggestion } = _buildConflictAndSuggestion(
      action,
      portOccupier,
      homePageCheck,
      apiHealthCheck,
      processOwnershipCheck
    );
    _updateReceipt(receipt.id, {
      status: 'failed',
      processOwnershipCheck,
      conflictDescription,
      handlingSuggestion,
      actualPid,
      actualPort,
      durationMs: Date.now() - startTime,
      completedAt: now(),
    });
    _addTimelineEvent(
      receipt.id,
      '接管失败',
      `首页:${homePageCheck.status}, API:${apiHealthCheck.status}, 归属:${processOwnershipCheck.status}`
    );
    return getReceiptById(receipt.id)!;
  }

  _updateReceipt(receipt.id, {
    status: 'success',
    processOwnershipCheck,
    actualPid,
    actualPort,
    durationMs: Date.now() - startTime,
    completedAt: now(),
  });
  _addTimelineEvent(
    receipt.id,
    '接管成功',
    `${action === 'launch' ? '启动' : '复用'}完成，首页和 API 均检测通过`
  );
  return getReceiptById(receipt.id)!;
}

export function undoLastReceipt(username: string): TakeoverReceipt | null {
  const last = db
    .prepare(
      `SELECT * FROM takeover_receipts 
       WHERE operator_username = ? AND is_undone = 0 AND action IN ('launch', 'reuse') AND status = 'success'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(username);
  if (!last) return null;

  const receipt = _rowToReceipt(last);
  if (!receipt.actualPid || !receipt.actualPort) return null;

  const undoReceipt = _createReceipt({
    planId: receipt.planId,
    planName: receipt.planName,
    action: 'stop',
    operatorUsername: username,
  });

  _updateReceipt(undoReceipt.id, {
    status: 'running',
    undoOfId: receipt.id,
  });
  _addTimelineEvent(undoReceipt.id, '撤销接管', `撤销回执 #${receipt.id}`);

  const tracked = runningProcesses.get(receipt.actualPid);
  if (tracked) {
    try {
      tracked.process.kill('SIGTERM');
    } catch {}
    runningProcesses.delete(receipt.actualPid);
  } else {
    try {
      process.kill(receipt.actualPid, 'SIGTERM');
    } catch (e: any) {
      _updateReceipt(undoReceipt.id, {
        status: 'failed',
        homePageCheck: { status: 'skipped' },
        apiHealthCheck: { status: 'skipped' },
        processOwnershipCheck: { status: 'failed', message: `终止进程失败: ${e.message}` },
        conflictDescription: `撤销失败: 终止进程 PID:${receipt.actualPid} 出错`,
        handlingSuggestion: '请手动检查进程状态，可能需要手动终止',
        undoOfId: receipt.id,
        durationMs: 0,
        completedAt: now(),
      });
      return getReceiptById(undoReceipt.id);
    }
  }

  db.prepare('UPDATE takeover_receipts SET is_undone = 1 WHERE id = ?').run(receipt.id);

  _updateReceipt(undoReceipt.id, {
    status: 'success',
    homePageCheck: { status: 'skipped', message: '撤销操作无需检测' },
    apiHealthCheck: { status: 'skipped', message: '撤销操作无需检测' },
    processOwnershipCheck: { status: 'success', message: '撤销完成，进程已终止' },
    actualPid: receipt.actualPid,
    actualPort: receipt.actualPort,
    undoOfId: receipt.id,
    durationMs: 0,
    completedAt: now(),
  });
  _addTimelineEvent(undoReceipt.id, '撤销成功', `已终止进程 PID:${receipt.actualPid}，原回执 #${receipt.id} 已标记为已撤销`);

  return getReceiptById(undoReceipt.id);
}

export function getLastSuccessfulPlan(username: string): TakeoverPlan | null {
  const row = db
    .prepare(
      `SELECT tp.* FROM takeover_plans tp
       INNER JOIN takeover_receipts tr ON tr.plan_id = tp.id
       WHERE tr.status = 'success' AND tr.is_undone = 0 AND tr.operator_username = ?
       ORDER BY tr.completed_at DESC LIMIT 1`
    )
    .get(username);
  return row ? _rowToPlan(row) : null;
}

export function exportPlans(username: string): TakeoverPlanExport {
  const plans = listPlans(username);
  return {
    version: 1,
    exportedAt: now(),
    plans,
  };
}

export function importPlans(
  data: TakeoverPlanExport,
  importerUsername: string
): { imported: number; skipped: number; importedPlans: TakeoverPlan[] } {
  let imported = 0;
  let skipped = 0;
  const importedPlans: TakeoverPlan[] = [];

  if (!data || !Array.isArray(data.plans)) {
    return { imported, skipped, importedPlans };
  }

  for (const plan of data.plans) {
    try {
      if (!plan.name || !plan.expectedPort || !plan.homePageUrl || !plan.apiHealthUrl) {
        skipped++;
        continue;
      }
      const newPlan = createPlan({
        name: `${plan.name} (导入)`,
        description: plan.description ? `${plan.description} [导入自 ${plan.ownerUsername}]` : `导入自 ${plan.ownerUsername}`,
        scope: 'private',
        ownerUsername: importerUsername,
        frontendCommand: plan.frontendCommand,
        backendCommand: plan.backendCommand,
        expectedPort: plan.expectedPort,
        homePageUrl: plan.homePageUrl,
        apiHealthUrl: plan.apiHealthUrl,
        timeoutSec: plan.timeoutSec || 30,
      });
      imported++;
      importedPlans.push(newPlan);
    } catch {
      skipped++;
    }
  }

  return { imported, skipped, importedPlans };
}
