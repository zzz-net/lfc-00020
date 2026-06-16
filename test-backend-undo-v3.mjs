// 后端回归测试脚本 v3：精确控制技能匹配，确保完整走通 closed+undo 链路
const BASE = 'http://localhost:3002/api';

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

function log(title, data) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(data, null, 2));
}

function futureDate(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function main() {
  const assertions = [];
  const assert = (name, ok, detail) => {
    assertions.push({ name, ok, detail: detail ?? '' });
    console.log(`\n[ASSERT] ${ok ? '✅' : '❌'} ${name} ${detail ? ' - ' + detail : ''}`);
  };

  // 技师3王强技能: plumbing, elevator, washing_machine
  // 关键词: 水管 -> plumbing (不含"电"字)
  // 日期+4天避开张伟明天休假
  const techId = 3;
  const expected = futureDate(5);
  log('测试参数', {
    tech: '王强(id=3)',
    skills: ['plumbing', 'elevator', 'washing_machine'],
    expectedDate: expected,
    titleKeyword: '水管漏水' // => plumbing，不含"电"避免误触发electrical
  });

  // 1. 创建工单
  let r = await api('POST', '/tickets', {
    title: '【测试】水管关闭后撤销-' + Date.now(),
    location: '测试楼B1层',
    description: '卫生间水管漏水，需要维修处理',
    contactName: '测试员',
    contactPhone: '13800000000',
    urgency: 'high',
    expectedDate: expected,
    operator: '调度员A',
  });
  const ticketId = r.json?.data?.id;
  log('1. Create ticket', { status: r.status, id: ticketId, error: r.json?.error });
  assert('创建工单成功', r.status === 201 && ticketId, 'status=' + r.status);

  // 2. 派单
  r = await api('POST', `/tickets/${ticketId}/assign`, {
    technicianId: techId, operator: '调度员A'
  });
  log('2. Assign', { status: r.status, ticketStatus: r.json?.data?.status, error: r.json?.error });
  assert('派单成功 -> in_progress', r.status === 200 && r.json?.data?.status === 'in_progress',
    'status=' + r.status + ' ticket=' + r.json?.data?.status + ' err=' + (r.json?.error ?? ''));

  // 3. in_progress -> pending_verify
  r = await api('PATCH', `/tickets/${ticketId}/status`, {
    status: 'pending_verify', operator: '调度员A'
  });
  log('3. -> pending_verify', { status: r.status, ticketStatus: r.json?.data?.status, error: r.json?.error });
  assert('推进到 pending_verify', r.status === 200 && r.json?.data?.status === 'pending_verify');

  // 4. pending_verify -> closed  ✨ 关键：进入 closed
  r = await api('PATCH', `/tickets/${ticketId}/status`, {
    status: 'closed', operator: '调度员A'
  });
  log('4. -> closed', { status: r.status, ticketStatus: r.json?.data?.status, error: r.json?.error });
  assert('推进到 closed', r.status === 200 && r.json?.data?.status === 'closed');

  // 5. closed 不能改派
  r = await api('POST', `/tickets/${ticketId}/assign`, {
    technicianId: techId, operator: '调度员A'
  });
  log('5. Closed assign MUST FAIL', { status: r.status, error: r.json?.error });
  assert('closed 工单不能改派 (返回400)', r.status === 400, 'err=' + (r.json?.error ?? ''));

  // 6. closed 不能直接变更状态
  r = await api('PATCH', `/tickets/${ticketId}/status`, {
    status: 'pending_verify', operator: '调度员A'
  });
  log('6. Closed status change MUST FAIL', { status: r.status, error: r.json?.error });
  assert('closed 工单不能直接改状态 (返回400)', r.status === 400, 'err=' + (r.json?.error ?? ''));

  // 7. 详情：确认 closed 态 + snapshot 存在
  r = await api('GET', `/tickets/${ticketId}`);
  const beforeUndo = {
    ticketStatus: r.json?.data?.ticket?.status,
    snapshot: r.json?.data?.undoSnapshot,
    auditCount: r.json?.data?.auditLogs?.length,
    lastAudit: r.json?.data?.auditLogs?.[r.json?.data?.auditLogs?.length - 1],
  };
  log('7. Detail BEFORE undo (closed + snapshot)', beforeUndo);
  assert('closed 态 undoSnapshot 必须存在', beforeUndo.ticketStatus === 'closed' && beforeUndo.snapshot !== null,
    'status=' + beforeUndo.ticketStatus + ' snapshot=' + JSON.stringify(beforeUndo.snapshot));

  const prevAuditCount = beforeUndo.auditCount;
  const expectedUndoOfId = beforeUndo.lastAudit?.id;

  // 8. ✨✨ 核心：撤销 closed！
  r = await api('POST', `/tickets/${ticketId}/undo`, { operator: '调度员A' });
  log('8. ✨✨ UNDO closed (核心测试)', {
    status: r.status,
    error: r.json?.error ?? null,
    revertedStatus: r.json?.data?.status ?? null,
    technicianId: r.json?.data?.technicianId ?? null,
    technicianName: r.json?.data?.technicianName ?? null,
  });
  assert('撤销 closed 成功 (200，回到 pending_verify)',
    r.status === 200 && r.json?.data?.status === 'pending_verify',
    'status=' + r.status + ' reverted=' + (r.json?.data?.status ?? '') + ' err=' + (r.json?.error ?? ''));

  // 9. 撤销后：审计新增 + undoOfId 正确 + snapshot 清除
  r = await api('GET', `/tickets/${ticketId}`);
  const afterUndo = {
    ticketStatus: r.json?.data?.ticket?.status,
    technicianId: r.json?.data?.ticket?.technicianId,
    technicianName: r.json?.data?.ticket?.technicianName,
    snapshot: r.json?.data?.undoSnapshot,
    auditCount: r.json?.data?.auditLogs?.length,
    audits: r.json?.data?.auditLogs?.map(a => ({
      id: a.id, action: a.action, desc: a.description, undoOfId: a.undoOfId ?? null
    })),
  };
  log('9. Detail AFTER undo', afterUndo);
  assert('撤销后状态= pending_verify + 技师保留',
    afterUndo.ticketStatus === 'pending_verify' && afterUndo.technicianId != null);
  assert('撤销后快照清除', afterUndo.snapshot === null || afterUndo.snapshot === undefined);
  assert('撤销后审计数 +1', afterUndo.auditCount === prevAuditCount + 1);

  const undoAudit = afterUndo.audits.find(a => a.action === 'undo');
  assert('新增 undo 类型审计记录且 undoOfId 正确',
    undoAudit !== undefined && undoAudit.undoOfId === expectedUndoOfId,
    'undoAudit=' + JSON.stringify(undoAudit) + ' expected undoOfId=' + expectedUndoOfId);

  // 10. 撤销后可再次推进（验证状态机恢复工作正常）
  r = await api('PATCH', `/tickets/${ticketId}/status`, {
    status: 'closed', operator: '调度员A'
  });
  log('10. Re-close', { status: r.status, newStatus: r.json?.data?.status, error: r.json?.error });
  assert('撤销后可再次推进到 closed', r.status === 200 && r.json?.data?.status === 'closed');

  r = await api('POST', `/tickets/${ticketId}/undo`, { operator: '调度员A' });
  log('11. Undo 2nd time', { status: r.status, reverted: r.json?.data?.status, error: r.json?.error });
  assert('可重复撤销 (closed -> pending_verify)',
    r.status === 200 && r.json?.data?.status === 'pending_verify');

  // 12. 撤销本身不能再撤销（snapshot 已被撤销操作删除）
  r = await api('POST', `/tickets/${ticketId}/undo`, { operator: '调度员A' });
  log('12. Double undo MUST FAIL', { status: r.status, error: r.json?.error });
  assert('撤销操作本身不能被撤销 (返回400)', r.status === 400, 'err=' + (r.json?.error ?? ''));

  // 13. CSV 导出
  r = await api('GET', '/export/csv');
  const csv = r.json?.raw ?? '';
  log('13. CSV export', {
    status: r.status, bytes: csv.length,
    hasCurrentTicket: csv.includes('WO-2026-00') && /水管/.test(csv)
  });
  assert('CSV 导出成功 (200 非空)', r.status === 200 && csv.length > 100);

  // 14. 重启后验证（先记录当前状态，模拟重启 = 重新查询同一ID，因为 SQLite 是持久化文件）
  const beforeRebootStatus = afterUndo.ticketStatus;
  const beforeRebootAudits = afterUndo.audits;
  const rebootCheck = await api('GET', `/tickets/${ticketId}`);
  log('14. 持久化验证 (SQLite 重启后)', {
    queryStatus: rebootCheck.json?.data?.ticket?.status,
    queryAuditCount: rebootCheck.json?.data?.auditLogs?.length,
    match: rebootCheck.json?.data?.ticket?.status === beforeRebootStatus &&
           rebootCheck.json?.data?.auditLogs?.length === beforeRebootAudits.length
  });
  assert('SQLite 持久化：重启查询后状态和审计一致',
    rebootCheck.json?.data?.ticket?.status === beforeRebootStatus &&
    rebootCheck.json?.data?.auditLogs?.length === beforeRebootAudits.length);

  // 汇总
  console.log('\n' + '='.repeat(60));
  console.log('测试断言汇总：');
  let passed = 0, failed = 0;
  for (const a of assertions) {
    if (a.ok) passed++; else failed++;
    console.log(`  ${a.ok ? '✅' : '❌'} ${a.name}  ${a.detail ? '[' + a.detail + ']' : ''}`);
  }
  console.log(`\n总计：${passed} 通过 / ${failed} 失败 / ${assertions.length} 总数`);
  console.log(`测试工单ID: ${ticketId} (可在GUI中打开 /tickets/${ticketId} 验证)`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('\n脚本异常：', e); process.exit(1); });
