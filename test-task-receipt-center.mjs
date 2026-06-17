/**
 * 任务回执与验真中心 集成测试脚本
 * 覆盖：权限、重启恢复、重复提交拦截、结果条数与导出文件一致性、验真、重试链路、审计日志
 *
 * 使用方法：
 *   1. 先启动后端：npm run server:dev
 *   2. 另开终端执行：node test-task-receipt-center.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = 'http://localhost:3088/api';

const ADMIN = '调度员A';
const TECH = '张伟';
const STRANGER = '不存在的人';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(method, path, body, query) {
  const url = new URL(API_BASE + path);
  if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { res, json };
}

async function createBatch(operator, overrides = {}) {
  const { res, json } = await api('POST', '/export/batches', { operator, ...overrides });
  return { status: res.status, ok: res.ok, data: json.data, error: json.error };
}

async function listBatches(operator, status) {
  const { res, json } = await api('GET', '/export/batches', null, { operator, ...(status ? { status } : {}) });
  return { status: res.status, ok: res.ok, data: json.data ?? [], error: json.error };
}

async function getBatch(id, operator) {
  const { res, json } = await api('GET', `/export/batches/${id}`, null, { operator });
  return { status: res.status, ok: res.ok, data: json.data, error: json.error };
}

async function getVerification(id, operator) {
  const { res, json } = await api('GET', `/export/batches/${id}/verification`, null, { operator });
  return { status: res.status, ok: res.ok, data: json.data, error: json.error };
}

async function getRetryChain(id, operator) {
  const { res, json } = await api('GET', `/export/batches/${id}/retry-chain`, null, { operator });
  return { status: res.status, ok: res.ok, data: json.data ?? [], error: json.error };
}

async function cancelBatch(id, operator) {
  const { res, json } = await api('POST', `/export/batches/${id}/cancel`, { operator });
  return { status: res.status, ok: res.ok, data: json.data, error: json.error };
}

async function retryBatch(id, operator) {
  const { res, json } = await api('POST', `/export/batches/${id}/retry`, { operator });
  return { status: res.status, ok: res.ok, data: json.data, error: json.error };
}

async function downloadBatch(id, operator) {
  const { res } = await api('GET', `/export/batches/${id}/download`, null, { operator });
  return { status: res.status, ok: res.ok };
}

async function recoverBatches(operator) {
  const { res, json } = await api('POST', '/export/recover', { operator });
  return { status: res.status, ok: res.ok, data: json.data, error: json.error };
}

async function listAudit() {
  const { res, json } = await api('GET', '/audit');
  return { status: res.status, ok: res.ok, data: json.data ?? [] };
}

let tests = 0;
let passed = 0;
function test(name, fn) {
  tests++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

console.log('\n===== 任务回执与验真中心 集成测试 =====\n');

// ========== 1. 权限测试 ==========
console.log('1. 权限测试');
{
  const r1 = await createBatch(STRANGER);
  test('不存在用户无法创建导出批次', () => assert.equal(r1.ok, false));

  const r2 = await createBatch(ADMIN);
  test('管理员可创建导出批次', () => assert.equal(r2.ok, true));

  const r3 = await createBatch(TECH);
  test('技师可创建导出批次', () => assert.equal(r3.ok, true));

  // 管理员可看所有，技师只能看自己的
  const adminList = await listBatches(ADMIN);
  const techList = await listBatches(TECH);
  test('管理员列表包含技师创建的批次', () => assert.ok(adminList.data.length >= techList.data.length));

  // 技师无权查看别人的批次
  if (r2.data) {
    const peek = await getBatch(r2.data.id, TECH);
    test('技师无权查看管理员创建的批次', () => assert.equal(peek.ok, false));
  }
  if (r3.data) {
    const peek = await getBatch(r3.data.id, ADMIN);
    test('管理员可查看技师创建的批次', () => assert.equal(peek.ok, true));
  }

  // 恢复权限
  const recNoAdmin = await recoverBatches(TECH);
  test('技师不可触发恢复接口', () => assert.equal(recNoAdmin.ok, false));
  const recAdmin = await recoverBatches(ADMIN);
  test('管理员可触发恢复接口', () => assert.equal(recAdmin.ok, true));
}

// ========== 2. 重复提交拦截 ==========
console.log('\n2. 重复提交拦截测试');
{
  const filters = { startDate: '2026-01-01', endDate: '2026-12-31' };
  const first = await createBatch(ADMIN, filters);
  test('首次创建成功', () => assert.equal(first.ok, true));
  const dup = await createBatch(ADMIN, filters);
  test('5分钟内同条件重复创建被拦截', () => assert.equal(dup.ok, false));
  test('拦截错误提示包含批次号', () => assert.ok(dup.error?.includes('EXP')));
}

// ========== 3. 未开始任务取消 ==========
console.log('\n3. 未开始任务取消测试');
{
  const created = await createBatch(ADMIN);
  if (created.ok && created.data) {
    const batchId = created.data.id;
    // 立刻取消（pending状态）
    await sleep(50);
    const cancelled = await cancelBatch(batchId, ADMIN);
    test('pending状态可被取消', () => assert.equal(cancelled.ok, true));
    test('取消后状态为 cancelled', () => assert.equal(cancelled.data?.status, 'cancelled'));
    test('cancelledBy 被正确记录', () => assert.equal(cancelled.data?.cancelledBy, ADMIN));
    // 取消后不可再次取消
    const again = await cancelBatch(batchId, ADMIN);
    test('已取消的批次不可再次取消', () => assert.equal(again.ok, false));
  }
}

// ========== 4. 验真与结果条数 ==========
console.log('\n4. 验真与结果条数一致性测试');
{
  const created = await createBatch(ADMIN);
  assert.equal(created.ok, true);
  const batchId = created.data.id;
  const expectedCount = created.data.totalCount;

  // 等待异步处理完成
  let finished = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const got = await getBatch(batchId, ADMIN);
    if (got.ok && (got.data.status === 'completed' || got.data.status === 'failed')) {
      finished = got.data;
      break;
    }
  }
  test('异步导出任务在合理时间内完成', () => assert.ok(finished));

  if (finished) {
    test('completed 状态必须是验真通过的（verified）', () =>
      assert.equal(finished.verificationStatus, finished.status === 'completed' ? 'verified' : finished.verificationStatus));

    if (finished.status === 'completed') {
      // 调用验真接口
      const v = await getVerification(batchId, ADMIN);
      test('验真接口返回快照条数与预期一致', () => assert.equal(v.data.snapshotCount, expectedCount));
      test('验真接口返回文件条数与预期一致', () => assert.equal(v.data.fileRowCount, expectedCount));
      test('验真接口 countMatch=true', () => assert.equal(v.data.countMatch, true));
      test('SHA256 为 64 位十六进制字符串', () => assert.match(v.data.fileSha256, /^[a-f0-9]{64}$/));
      test('fileSizeBytes > 0', () => assert.ok(v.data.fileSizeBytes > 0));

      // 下载接口必须通过验真才能下载
      const dl = await downloadBatch(batchId, ADMIN);
      test('验真通过的批次可下载', () => assert.equal(dl.ok, true));
    }

    // 验证 exportedCount === totalCount
    test('exportedCount 等于 totalCount（验真一致性）', () =>
      assert.equal(finished.exportedCount, finished.totalCount));

    // fileRowCount 字段在批次详情中
    test('批次详情包含 fileRowCount', () => assert.ok(Number.isFinite(finished.fileRowCount)));
    test('批次详情包含 fileSha256', () => assert.ok(typeof finished.fileSha256 === 'string' && finished.fileSha256.length > 0));
  }
}

// ========== 5. 重试链路 ==========
console.log('\n5. 重试链路测试');
{
  // 先让技师创建一个然后取消
  const created = await createBatch(TECH);
  assert.equal(created.ok, true);
  await sleep(50);
  const cancelled = await cancelBatch(created.data.id, TECH);
  assert.equal(cancelled.ok, true);

  // 管理员重试技师的批次
  const retried = await retryBatch(created.data.id, ADMIN);
  test('cancelled 状态可重试并生成新批次', () => assert.equal(retried.ok, true));
  test('重试新批次有 retryOfId 指向原批次', () => assert.equal(retried.data.retryOfId, created.data.id));

  // 管理员查询链路 - 能看到所有
  const chain = await getRetryChain(retried.data.id, ADMIN);
  test('重试链路包含原批次和新批次', () => assert.ok(chain.data.length >= 2));
  test('链路中第一个为原批次', () => assert.equal(chain.data[0].id, created.data.id));
  test('链路中包含新批次', () => assert.ok(chain.data.some((b) => b.id === retried.data.id)));

  // 技师查询链路 - 只能看到自己创建的原批次，看不到管理员的重试批次
  const techChain = await getRetryChain(retried.data.id, TECH);
  test('技师只能看到链路中自己创建的批次（权限隔离）', () => assert.equal(techChain.data.length, 1));
  test('技师看到的是自己创建的原批次', () => assert.equal(techChain.data[0].id, created.data.id));
}

// ========== 6. 审计日志落库 ==========
console.log('\n6. 审计日志测试');
{
  const audit = await listAudit();
  test('审计日志接口返回成功', () => assert.equal(audit.ok, true));

  const actions = new Set(audit.data.map((l) => l.action));
  test('审计日志包含 export_create 动作', () => assert.ok(actions.has('export_create')));
  test('审计日志包含 export_cancel 动作', () => assert.ok(actions.has('export_cancel')));
  test('审计日志包含 export_retry 动作', () => assert.ok(actions.has('export_retry')));

  const exportComplete = audit.data.find((l) => l.action === 'export_complete');
  if (exportComplete) {
    test('export_complete 审计记录包含 afterData（有 SHA256 等信息）', () => {
      const after = JSON.parse(exportComplete.afterData || '{}');
      assert.ok(typeof after.fileSha256 === 'string');
    });
  }
}

// ========== 7. 服务重启恢复（模拟） ==========
console.log('\n7. 服务重启恢复测试（通过API模拟）');
{
  // 通过手动调用 recover 接口验证（服务启动时会自动调用，此处通过管理员手动触发验证逻辑）
  // 先创建一个批次，然后通过 DB 层面把它改成 pending（模拟重启前卡住）
  // 这里只能通过 API 层面验证 recover 接口逻辑：
  const rec = await recoverBatches(ADMIN);
  test('管理员手动触发恢复接口返回正确结构', () => {
    assert.ok(rec.ok);
    assert.ok(typeof rec.data.recovered === 'number');
    assert.ok(typeof rec.data.failed === 'number');
  });
}

// ========== 8. 技师权限过滤 ==========
console.log('\n8. 技师自动过滤条件');
{
  // 技师创建批次时应自动强制 technicianId 为自己
  const techBatch = await createBatch(TECH, { technicianId: 999 });
  test('技师创建时传入的 technicianId 会被覆盖为自身', () => {
    assert.equal(techBatch.ok, true);
    // 根据名字查 id：张伟 id=1
    assert.equal(techBatch.data.filters.technicianId, 1);
  });
}

console.log(`\n===== 测试结果：${passed}/${tests} 通过 =====\n`);
process.exit(passed === tests ? 0 : 1);
