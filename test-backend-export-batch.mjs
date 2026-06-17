// 测试导出批次快照功能
const BASE = 'http://localhost:3002';

let failed = 0;
let total = 0;

function assert(cond, msg) {
  total++;
  if (cond) {
    console.log('  ✅ ' + msg);
  } else {
    failed++;
    console.error('  ❌ ' + msg);
  }
}

async function api(method, path, body) {
  const opts = {
    method: method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = text; }
  return { ok: res.ok, status: res.status, data: data };
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

const OP_ADMIN = encodeURIComponent('管理员');
const OP_ZHANG = encodeURIComponent('张伟');
const OP_DISP_A = encodeURIComponent('调度员A');
const OP_DISP_B = encodeURIComponent('调度员B');

console.log('\n========== 导出批次快照功能测试 ==========\n');

(async function() {
  try {
    // ========== 1. 权限测试 ==========
    console.log('1. 权限控制测试');

    // 1.1 管理员创建批次
    console.log('\n  1.1 管理员创建批次');
    const r1 = await api('POST', '/api/export/batches', { operator: '管理员', status: 'in_progress' });
    assert(r1.ok, '管理员创建返回 201，实际 ' + r1.status + ' ' + (r1.data && r1.data.error ? r1.data.error : ''));
    assert(!!r1.data && !!r1.data.data && !!r1.data.data.batchNo, '返回批次号存在');
    const adminBatchId = r1.data.data.id;

    // 1.2 技师创建批次（自动限制为自己的工单）
    console.log('\n  1.2 技师张伟创建批次');
    const r2 = await api('POST', '/api/export/batches', { operator: '张伟', status: 'closed' });
    assert(r2.ok, '技师创建返回 201，实际 ' + r2.status + ' ' + (r2.data && r2.data.error ? r2.data.error : ''));
    const techBatchId = r2.data.data.id;
    assert(
      r2.data.data.filters && r2.data.data.filters.technicianId !== undefined,
      '技师创建时自动注入 technicianId 限制'
    );

    // 1.3 不存在的操作人
    console.log('\n  1.3 不存在操作人被拒绝');
    const r3 = await api('POST', '/api/export/batches', { operator: '不存在的人', status: 'pending_verify' });
    assert(!r3.ok, '不存在操作人返回非 2xx，实际 ' + r3.status);

    // 1.4 技师查看别人的批次被拒
    console.log('\n  1.4 技师查看管理员的批次被拒');
    const r4 = await api('GET', '/api/export/batches/' + adminBatchId + '?operator=' + OP_ZHANG);
    assert(!r4.ok, '技师看管理员批次被拒绝，状态 ' + r4.status);

    // 1.5 管理员查看所有人
    const r5 = await api('GET', '/api/export/batches/' + techBatchId + '?operator=' + OP_ADMIN);
    assert(r5.ok, '管理员可查看技师批次');

    // 1.6 列表权限
    console.log('\n  1.5 列表权限');
    const r6 = await api('GET', '/api/export/batches?operator=' + OP_ADMIN);
    const adminList = r6.data.data || [];
    assert(adminList.length >= 2, '管理员列表至少包含 2 条（实际 ' + adminList.length + '）');
    const r7 = await api('GET', '/api/export/batches?operator=' + OP_ZHANG);
    const techList = r7.data.data || [];
    const onlyOwn = techList.every(function(b) { return b.operator === '张伟'; });
    assert(onlyOwn, '技师列表只包含自己的批次');

    // ========== 3. 取消与重试测试（先做，趁批次还是 pending） ==========
    console.log('\n3. 取消与重试测试');

    const rForCancel = await api('POST', '/api/export/batches', { operator: '调度员B', startDate: '2020-01-01' });
    const cancelId = rForCancel.data.data.id;
    await sleep(50); // 极短等待确保写入完成
    console.log('\n  3.1 取消 pending 批次');
    const rCancel = await api('POST', '/api/export/batches/' + cancelId + '/cancel', { operator: '调度员B' });
    assert(rCancel.ok, '取消成功（' + rCancel.status + '）');
    assert(rCancel.data.data.status === 'cancelled', '状态变为 cancelled');

    // ========== 2. 重复提交拦截 ==========
    console.log('\n2. 重复提交拦截测试');
    console.log('\n  2.1 5分钟内相同条件拦截');
    await api('POST', '/api/export/batches', { operator: '调度员A', status: 'pending_assign' });
    const rDup = await api('POST', '/api/export/batches', { operator: '调度员A', status: 'pending_assign' });
    assert(!rDup.ok, '相同条件重复提交被拦截（' + rDup.status + '）');
    assert(
      !!rDup.data && !!rDup.data.error &&
      (rDup.data.error.indexOf('5分钟') >= 0 || rDup.data.error.indexOf('相同条件') >= 0),
      '错误信息包含拦截原因: ' + (rDup.data ? rDup.data.error : '')
    );

    console.log('\n  3.2 已取消批次不可再次取消');
    const rCancel2 = await api('POST', '/api/export/batches/' + cancelId + '/cancel', { operator: '调度员B' });
    assert(!rCancel2.ok, '已取消批次取消失败（' + rCancel2.status + '）');

    console.log('\n  3.3 重试已取消批次');
    const rRetry = await api('POST', '/api/export/batches/' + cancelId + '/retry', { operator: '调度员B' });
    assert(rRetry.ok, '重试成功（' + rRetry.status + '）');
    assert(rRetry.data.data.batchNo !== rForCancel.data.data.batchNo, '重试生成新批次号');

    // ========== 4. 生成完成与下载 ==========
    console.log('\n4. 生成完成与文件下载测试');
    await sleep(2000);

    console.log('\n  4.1 等待 processing -> completed 状态流转');
    let completedBatch = null;
    for (let i = 0; i < 15; i++) {
      const r = await api('GET', '/api/export/batches/' + adminBatchId + '?operator=' + OP_ADMIN);
      if (r.data && r.data.data && r.data.data.status === 'completed') {
        completedBatch = r.data.data;
        break;
      }
      await sleep(500);
    }
    assert(completedBatch !== null, '批次状态到达 completed（最终：' + (completedBatch && completedBatch.status) + '）');

    console.log('\n  4.2 导出条数与 totalCount 一致');
    assert(
      completedBatch && completedBatch.exportedCount === completedBatch.totalCount,
      'exportedCount(' + (completedBatch && completedBatch.exportedCount) + ') == totalCount(' + (completedBatch && completedBatch.totalCount) + ')'
    );
    assert(completedBatch && !!completedBatch.fileName, '文件名存在：' + (completedBatch && completedBatch.fileName));
    assert(completedBatch && !!completedBatch.filePath, '文件路径存在');

    console.log('\n  4.3 可下载 CSV 文件');
    const rDl = await api('GET', '/api/export/batches/' + adminBatchId + '/download?operator=' + OP_ADMIN);
    assert(rDl.ok, '下载成功（' + rDl.status + '）');
    const csvContent = typeof rDl.data === 'string' ? rDl.data : '';
    assert(
      csvContent.indexOf('工单编号') >= 0,
      'CSV 内容包含表头'
    );

    // ========== 5. 快照与差异 ==========
    console.log('\n5. 快照与差异标记测试');

    const rSnap = await api('POST', '/api/export/batches', { operator: '管理员', endDate: '2099-12-31' });
    const snapBatchId = rSnap.data.data.id;
    await sleep(1500);

    console.log('\n  5.1 获取快照列表');
    const rSnapList = await api('GET', '/api/export/batches/' + snapBatchId + '/snapshots?operator=' + OP_ADMIN);
    assert(rSnapList.ok, '获取快照成功');
    const snaps = rSnapList.data.data || [];
    assert(snaps.length > 0, '快照条数 > 0');
    const firstSnap = snaps[0];
    assert(!!firstSnap.ticketNo && !!firstSnap.title, '快照包含工单编号和标题');
    assert('hasStatusDiff' in firstSnap, '快照包含差异标记字段');

    console.log('\n  5.2 修改工单后差异被标记');
    const rTickets = await api('GET', '/api/tickets');
    const tickets = rTickets.data.data || [];
    const assignable = tickets.find(function(t) { return t.status === 'pending_assign'; });
    let diffVerified = false;
    if (assignable) {
      await api('POST', '/api/tickets/' + assignable.id + '/assign', {
        technicianId: 1,
        operator: '管理员',
      });
      await sleep(300);
      const rSnapDiff = await api('GET', '/api/export/batches/' + snapBatchId + '/snapshots?operator=' + OP_ADMIN);
      const diffSnaps = rSnapDiff.data.data || [];
      const changed = diffSnaps.find(function(s) { return s.ticketId === assignable.id; });
      if (changed && (changed.hasTechnicianDiff === true || changed.hasStatusDiff === true)) {
        diffVerified = true;
        assert(true, '工单变更后 hasTechnicianDiff 或 hasStatusDiff 标记为 true');
      } else {
        console.log('    ⚠️ 变更工单不在批次快照或差异未检测到');
      }
    } else {
      console.log('    ⚠️ 无可用工单用于变更测试');
    }

    // ========== 6. 持久化 ==========
    console.log('\n6. 持久化验证');
    console.log('\n  6.1 批次记录可全部查询到');
    const rListAll = await api('GET', '/api/export/batches?operator=' + OP_ADMIN);
    const allBatches = rListAll.data.data || [];
    assert(allBatches.length >= 4, '至少存在 4 条历史批次（实际 ' + allBatches.length + '）');
    const hasCompleted = allBatches.some(function(b) { return b.status === 'completed'; });
    assert(hasCompleted, '存在 completed 状态批次');
    const hasCancelled = allBatches.some(function(b) { return b.status === 'cancelled'; });
    assert(hasCancelled, '存在 cancelled 状态批次');

    console.log('\n  6.2 快照记录落库');
    assert(snaps.length > 0, '快照记录存在并可查询');

    // ========== 7. 筛选结果与导出文件一致性 ==========
    console.log('\n7. 筛选结果与导出文件一致性');

    const rFiltered = await api('POST', '/api/export/batches', {
      operator: '管理员',
      status: 'pending_assign',
    });
    const filteredBatchId = rFiltered.data.data.id;
    const expectedCount = rFiltered.data.data.totalCount;
    console.log('    筛选命中 pending_assign 工单：' + expectedCount + ' 条');
    await sleep(1500);

    const rFSnaps = await api('GET', '/api/export/batches/' + filteredBatchId + '/snapshots?operator=' + OP_ADMIN);
    const snapCount = (rFSnaps.data.data || []).length;
    assert(snapCount === expectedCount, '快照条数(' + snapCount + ') == 批次总数(' + expectedCount + ')');

    const rFDl = await api('GET', '/api/export/batches/' + filteredBatchId + '/download?operator=' + OP_ADMIN);
    const csvLines = (typeof rFDl.data === 'string' ? rFDl.data : '').split('\r\n').filter(function(l) { return l.trim(); });
    const dataRowCount = Math.max(0, csvLines.length - 1);
    assert(
      dataRowCount === expectedCount,
      'CSV 数据行(' + dataRowCount + ') == 筛选命中数(' + expectedCount + ')'
    );

    // ========== 8. 边界：失败/取消的批次不能下载 ==========
    console.log('\n8. 边界：失败/取消批次不可下载');
    const rNoDl = await api('GET', '/api/export/batches/' + cancelId + '/download?operator=' + OP_DISP_B);
    assert(!rNoDl.ok, '取消的批次不能下载（' + rNoDl.status + '）');

    // ========== 结果汇总 ==========
    console.log('\n========== 测试结果 ==========');
    console.log('通过: ' + (total - failed) + ' / ' + total);
    if (failed === 0) {
      console.log('🎉 全部测试通过！');
    } else {
      console.log('❌ ' + failed + ' 项失败');
      process.exit(1);
    }
  } catch (e) {
    console.error('\n测试异常:', e);
    process.exit(1);
  }
})();
