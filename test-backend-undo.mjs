// 后端回归测试脚本：验证 closed 态可撤销 + 不能改派 + 审计正确
// 运行方式：node --experimental-strip-types test-backend-undo.mjs
// 或者用 tsx: npx tsx test-backend-undo.mts

const BASE = 'http://localhost:3002/api';

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
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

async function main() {
  // 1. Health
  let r = await api('GET', '/health');
  log('1. Health check', r);

  // 2. 获取工单列表
  r = await api('GET', '/tickets');
  log('2. Tickets list (count)', { count: r.json?.data?.length ?? 0, first: r.json?.data?.[0] });

  // 3. 创建测试工单
  r = await api('POST', '/tickets', {
    title: '【测试】关闭后撤销验证-' + Date.now(),
    location: '测试楼1层',
    description: '空调不制冷，需要维修',
    contactName: '测试员',
    contactPhone: '13800000000',
    urgency: 'high',
    expectedDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    operator: '测试调度员',
  });
  log('3. Create ticket', r);
  const ticketId = r.json?.data?.id;
  if (!ticketId) { console.error('创建工单失败'); process.exit(1); }

  // 4. 获取技师列表
  r = await api('GET', '/technicians');
  log('4. Technicians list', { count: r.json?.data?.length, first3: r.json?.data?.slice(0, 3) });
  const techId = r.json?.data?.[0]?.id;
  if (!techId) { console.error('无技师可用'); process.exit(1); }

  // 5. 派单 (pending_assign -> in_progress)
  r = await api('POST', `/tickets/${ticketId}/assign`, {
    technicianId: techId,
    operator: '测试调度员',
  });
  log('5. Assign ticket', { status: r.status, ticketStatus: r.json?.data?.status });

  // 6. 推进: in_progress -> pending_verify
  r = await api('PATCH', `/tickets/${ticketId}/status`, {
    status: 'pending_verify',
    operator: '测试调度员',
  });
  log('6. Status in_progress -> pending_verify', { status: r.status, ticketStatus: r.json?.data?.status });

  // 7. 推进: pending_verify -> closed
  r = await api('PATCH', `/tickets/${ticketId}/status`, {
    status: 'closed',
    operator: '测试调度员',
  });
  log('7. Status pending_verify -> closed', { status: r.status, ticketStatus: r.json?.data?.status });

  // 8. 验证：closed 工单不能改派
  r = await api('POST', `/tickets/${ticketId}/assign`, {
    technicianId: techId,
    operator: '测试调度员',
  });
  log('8. Closed assign (should fail 400)', { status: r.status, error: r.json?.error });

  // 9. 验证：closed 工单不能直接 status change
  r = await api('PATCH', `/tickets/${ticketId}/status`, {
    status: 'pending_verify',
    operator: '测试调度员',
  });
  log('9. Closed direct status change (should fail 400)', { status: r.status, error: r.json?.error });

  // 10. 获取详情，检查 undoSnapshot 是否存在
  r = await api('GET', `/tickets/${ticketId}`);
  log('10. Ticket detail before undo', {
    ticketStatus: r.json?.data?.ticket?.status,
    undoSnapshot: r.json?.data?.undoSnapshot,
    auditCount: r.json?.data?.auditLogs?.length,
    lastAudit: r.json?.data?.auditLogs?.[r.json?.data?.auditLogs?.length - 1],
  });

  // 11. ✨ 关键测试：撤销 closed
  r = await api('POST', `/tickets/${ticketId}/undo`, {
    operator: '测试调度员',
  });
  log('11. UNDO closed (核心测试)', {
    status: r.status,
    error: r.json?.error,
    revertedStatus: r.json?.data?.status,
    ticket: r.json?.data,
  });

  // 12. 撤销后检查详情和审计
  r = await api('GET', `/tickets/${ticketId}`);
  log('12. After undo - status + audit', {
    ticketStatus: r.json?.data?.ticket?.status,
    undoSnapshot: r.json?.data?.undoSnapshot,
    auditCount: r.json?.data?.auditLogs?.length,
    audits: r.json?.data?.auditLogs?.map(a => ({ id: a.id, action: a.action, desc: a.description, undoOfId: a.undoOfId })),
  });

  // 13. 再推进一次到 closed，再撤销，验证可重复
  r = await api('PATCH', `/tickets/${ticketId}/status`, {
    status: 'closed',
    operator: '测试调度员',
  });
  log('13. Re-close (pending_verify -> closed)', {
    status: r.status,
    ticketStatus: r.json?.data?.status,
  });

  r = await api('POST', `/tickets/${ticketId}/undo`, {
    operator: '测试调度员',
  });
  log('14. Undo again', {
    status: r.status,
    error: r.json?.error,
    revertedStatus: r.json?.data?.status,
  });

  // 15. CSV 导出
  r = await api('GET', '/export/csv');
  log('15. CSV export', {
    status: r.status,
    contentLength: r.json?.raw?.length ?? 0,
    preview: (r.json?.raw ?? '').slice(0, 300),
  });

  console.log('\n🏁 全部测试步骤执行完成');
  console.log(`测试工单ID: ${ticketId}`);
}

main().catch(e => { console.error(e); process.exit(1); });
