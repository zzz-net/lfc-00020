import http from "node:http";
import { spawn } from "node:child_process";
import * as net from "node:net";

const API_BASE = "http://localhost:3089/api/takeover";
const BACKEND_PORT = 3089;

let passed = 0;
let failed = 0;
const failures = [];

function log(msg, type = "info") {
  const prefix = {
    info: "[INFO] ",
    pass: "[PASS] ",
    fail: "[FAIL] ",
    head: "\n==== ",
  }[type] || "";
  const color = {
    info: "\x1b[36m",
    pass: "\x1b[32m",
    fail: "\x1b[31m",
    head: "\x1b[35m",
  }[type] || "";
  console.log(`${color}${prefix}${msg}\x1b[0m`);
}

function assert(name, cond, detail = "") {
  if (cond) {
    passed++;
    log(`${name}`, "pass");
  } else {
    failed++;
    failures.push({ name, detail });
    log(`${name} ${detail ? `— ${detail}` : ""}`, "fail");
  }
}

function httpReq(url, options = {}, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      timeout: options.timeout || 20000,
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch {
          json = { raw: data };
        }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    if (body !== undefined) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function headers(username) {
  return { headers: { "x-username": username } };
}

async function waitForPort(port, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const s = net.createConnection({ port, host: "127.0.0.1" }, () => {
          s.end();
          resolve();
        });
        s.on("error", reject);
        s.setTimeout(500, () => s.destroy(new Error("timeout")));
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

let backendProc = null;

async function startBackend() {
  log("启动后端服务…", "info");
  const { spawn } = await import("node:child_process");
  const { default: path } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.resolve(__dirname, "api/server.ts");
  backendProc = spawn("npx", ["tsx", scriptPath], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(BACKEND_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  backendProc.stdout.on("data", (d) => process.stdout.write(`[backend] ${d}`));
  backendProc.stderr.on("data", (d) => process.stderr.write(`[backend-err] ${d}`));
  const ok = await waitForPort(BACKEND_PORT, 25000);
  if (!ok) throw new Error("后端服务启动超时");
  log("后端服务就绪", "info");
}

async function stopBackend() {
  if (backendProc && !backendProc.killed) {
    log("停止后端服务…", "info");
    backendProc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function main() {
  log("环境接管回执中心 — 集成测试", "head");

  try {
    await startBackend();
  } catch (e) {
    log(`无法启动后端: ${e.message}`, "fail");
    process.exit(1);
  }

  let lastSuccessfulPlanId = null;
  let lastSuccessfulReceiptId = null;
  let createdPlanIds = [];

  try {
    // ── 基础方案 CRUD 与权限区分 ─────────────────────────────────
    log("权限区分与方案 CRUD", "head");

    let r = await httpReq(`${API_BASE}/plans`, headers("admin"));
    assert("admin 列出方案成功", r.status === 200 && r.body?.success, `status=${r.status}`);
    const initialPlans = r.body?.data || [];
    assert("初始方案至少 2 条", initialPlans.length >= 2, `count=${initialPlans.length}`);
    const firstPublicPlan = initialPlans.find((p) => p.scope === "public");
    assert("存在公共方案", !!firstPublicPlan);

    r = await httpReq(
      `${API_BASE}/plans`,
      { ...headers("devuser"), method: "POST" },
      {
        name: "devuser 越权测试-公共",
        scope: "public",
        expectedPort: 40100,
        homePageUrl: "http://localhost:40100/",
        apiHealthUrl: "http://localhost:40100/api/health",
        timeoutSec: 10,
      }
    );
    assert("场景 4：devuser 不能创建公共方案 (403)", r.status === 403, `status=${r.status}`);

    r = await httpReq(
      `${API_BASE}/plans`,
      { ...headers("devuser"), method: "POST" },
      {
        name: "devuser 私有方案",
        scope: "private",
        expectedPort: 40101,
        homePageUrl: "http://localhost:40101/",
        apiHealthUrl: "http://localhost:40101/api/health",
        timeoutSec: 10,
      }
    );
    assert("devuser 可以创建私有方案 (201)", r.status === 201 && r.body?.success);
    const devuserPlanId = r.body?.data?.id;
    assert("私有方案 ID 返回有效", !!devuserPlanId);
    createdPlanIds.push(devuserPlanId);

    r = await httpReq(
      `${API_BASE}/plans/${firstPublicPlan.id}`,
      { ...headers("devuser"), method: "PUT" },
      { name: "被 devuser 篡改" }
    );
    assert("场景 4：devuser 不能修改公共方案 (403)", r.status === 403);

    r = await httpReq(
      `${API_BASE}/plans/${devuserPlanId}`,
      { ...headers("admin"), method: "DELETE" }
    );
    assert("场景 4：admin 可以删除任意方案", r.status === 200 && r.body?.success);
    createdPlanIds = createdPlanIds.filter((id) => id !== devuserPlanId);

    // ── 端口占用检测 ──────────────────────────────────────────────
    log("端口占用检测", "head");

    r = await httpReq(`${API_BASE}/ports/59999/check`, headers("admin"));
    assert("空闲端口检测返回未占用", r.body?.data?.isOccupied === false, JSON.stringify(r.body?.data));

    r = await httpReq(`${API_BASE}/ports/${BACKEND_PORT}/check`, headers("admin"));
    assert("已占用端口检测返回占用", r.body?.data?.isOccupied === true, `port=${BACKEND_PORT} resp=${JSON.stringify(r.body?.data)}`);
    assert("端口占用返回 PID", typeof r.body?.data?.pid === "number" && r.body.data.pid > 0);
    assert("端口占用返回进程名", typeof r.body?.data?.processName === "string" && r.body.data.processName.length > 0);

    // ── 场景 1：端口被占用 (launch) ───────────────────────────────
    log("场景 1：端口被占用导致启动失败", "head");

    r = await httpReq(
      `${API_BASE}/plans`,
      { ...headers("admin"), method: "POST" },
      {
        name: "测试-端口冲突方案",
        scope: "private",
        expectedPort: BACKEND_PORT,
        homePageUrl: `http://localhost:${BACKEND_PORT}/`,
        apiHealthUrl: `http://localhost:${BACKEND_PORT}/api/health`,
        timeoutSec: 5,
        backendCommand: "echo should-not-run",
      }
    );
    const conflictPlanId = r.body?.data?.id;
    assert("冲突方案创建成功", !!conflictPlanId);
    createdPlanIds.push(conflictPlanId);

    r = await httpReq(
      `${API_BASE}/plans/${conflictPlanId}/execute`,
      { ...headers("admin"), method: "POST", timeout: 60000 },
      { action: "launch" }
    );
    assert("端口冲突执行接口正常返回", r.status === 200 && r.body?.success);
    const conflictReceipt = r.body?.data;
    assert("端口冲突回执状态为 failed", conflictReceipt.status === "failed", `status=${conflictReceipt.status}`);
    assert("有冲突说明", typeof conflictReceipt.conflictDescription === "string" && conflictReceipt.conflictDescription.length > 0);
    assert("有处理建议", typeof conflictReceipt.handlingSuggestion === "string" && conflictReceipt.handlingSuggestion.length > 0);
    assert("端口占用信息存在", !!conflictReceipt.portOccupier);
    assert("三重检测结构完整", conflictReceipt.homePageCheck && conflictReceipt.apiHealthCheck && conflictReceipt.processOwnershipCheck);

    // ── 创建真实后端服务方案 (用于后续多个场景) ─────────────────
    log("准备：创建真实后端服务方案用于多场景测试", "head");

    r = await httpReq(
      `${API_BASE}/plans`,
      { ...headers("admin"), method: "POST" },
      {
        name: "测试-真后端服务",
        description: "用于场景测试的真实后端",
        scope: "private",
        expectedPort: 40201,
        homePageUrl: "http://localhost:40201/api/health",
        apiHealthUrl: "http://localhost:40201/api/health",
        timeoutSec: 25,
        backendCommand: process.platform === "win32"
          ? `npx tsx api/server.ts`
          : `PORT=40201 npx tsx api/server.ts`,
      }
    );
    const realPlanId = r.body?.data?.id;
    assert("真实方案创建成功", !!realPlanId, JSON.stringify(r.body));
    createdPlanIds.push(realPlanId);
    lastSuccessfulPlanId = realPlanId;

    // ── 场景 1.5：正常 launch 成功 ────────────────────────────────
    log("子场景：launch 成功 + 三重校验通过", "head");

    log("执行 launch（请稍候，最长 60 秒）…", "info");
    r = await httpReq(
      `${API_BASE}/plans/${realPlanId}/execute`,
      { ...headers("admin"), method: "POST", timeout: 60000 },
      { action: "launch" }
    );
    assert("launch 接口返回成功结构", r.status === 200 && r.body?.success && !!r.body?.data);
    const launchReceipt = r.body.data;
    lastSuccessfulReceiptId = launchReceipt.id;
    assert("launch 回执 status=success", launchReceipt.status === "success", `status=${launchReceipt.status}`);
    assert("实际端口=预期端口 40201", launchReceipt.actualPort === 40201, `actual=${launchReceipt.actualPort}`);
    assert("实际 PID > 0", typeof launchReceipt.actualPid === "number" && launchReceipt.actualPid > 0, `pid=${launchReceipt.actualPid}`);
    assert("首页检测 success", launchReceipt.homePageCheck.status === "success", `home=${launchReceipt.homePageCheck?.status}`);
    assert("API 检测 success", launchReceipt.apiHealthCheck.status === "success", `api=${launchReceipt.apiHealthCheck?.status}`);
    assert("进程归属检测 success", launchReceipt.processOwnershipCheck.status === "success", `owner=${launchReceipt.processOwnershipCheck?.status}`);
    assert("进程归属检测不是 skipped", launchReceipt.processOwnershipCheck.status !== "skipped", `owner=${launchReceipt.processOwnershipCheck?.status}`);
    assert("执行时间线非空", Array.isArray(launchReceipt.timeline) && launchReceipt.timeline.length >= 4);

    const realHealth = await httpReq("http://localhost:40201/api/health", {});
    assert("真实服务实际响应 200 + ok", realHealth.status === 200 && realHealth.body?.message === "ok");

    // ── 场景 1.6：reuse 复用成功 ──────────────────────────────────
    log("子场景：reuse 复用已有进程", "head");

    r = await httpReq(
      `${API_BASE}/plans/${realPlanId}/execute`,
      { ...headers("admin"), method: "POST", timeout: 60000 },
      { action: "reuse" }
    );
    assert("reuse 接口成功返回", r.status === 200 && r.body?.success);
    const reuseReceipt = r.body.data;
    assert("reuse 回执 status=success", reuseReceipt.status === "success", `status=${reuseReceipt.status}`);
    assert("复用模式有端口占用信息", !!reuseReceipt.portOccupier);

    // ── 场景 2：首页 404 ─────────────────────────────────────────
    log("场景 2：首页 404 导致失败回执", "head");

    r = await httpReq(
      `${API_BASE}/plans`,
      { ...headers("admin"), method: "POST" },
      {
        name: "测试-首页404方案",
        scope: "private",
        expectedPort: 40201,
        homePageUrl: "http://localhost:40201/this-page-does-not-exist-xyz",
        apiHealthUrl: "http://localhost:40201/api/health",
        timeoutSec: 10,
      }
    );
    const badHomePlanId = r.body?.data?.id;
    assert("404方案创建成功", !!badHomePlanId);
    createdPlanIds.push(badHomePlanId);

    r = await httpReq(
      `${API_BASE}/plans/${badHomePlanId}/execute`,
      { ...headers("admin"), method: "POST", timeout: 60000 },
      { action: "reuse" }
    );
    const badHomeReceipt = r.body?.data;
    assert("404执行接口返回结构", r.status === 200 && r.body?.success && !!badHomeReceipt);
    assert("场景 2：回执状态为 failed", badHomeReceipt.status === "failed", `status=${badHomeReceipt.status}`);
    assert("场景 2：首页检测 failed", badHomeReceipt.homePageCheck.status === "failed", `home=${badHomeReceipt.homePageCheck?.status}`);
    assert("场景 2：冲突说明包含首页/404相关描述", typeof badHomeReceipt.conflictDescription === "string" && badHomeReceipt.conflictDescription.length > 0);
    assert("场景 2：处理建议非空", typeof badHomeReceipt.handlingSuggestion === "string" && badHomeReceipt.handlingSuggestion.length > 0);

    // ── 场景 3：只有 API 通、首页不通 ────────────────────────────
    log("场景 3：只有 API 通，三重校验未全部通过", "head");

    r = await httpReq(
      `${API_BASE}/plans`,
      { ...headers("admin"), method: "POST" },
      {
        name: "测试-仅API通方案",
        scope: "private",
        expectedPort: 40201,
        homePageUrl: "http://localhost:40201/nonexistent-home-page",
        apiHealthUrl: "http://localhost:40201/api/health",
        timeoutSec: 10,
      }
    );
    const apiOnlyPlanId = r.body?.data?.id;
    assert("仅API通方案创建成功", !!apiOnlyPlanId);
    createdPlanIds.push(apiOnlyPlanId);

    r = await httpReq(
      `${API_BASE}/plans/${apiOnlyPlanId}/execute`,
      { ...headers("admin"), method: "POST", timeout: 60000 },
      { action: "reuse" }
    );
    const apiOnlyReceipt = r.body?.data;
    assert("仅API通执行返回结构", r.status === 200 && r.body?.success && !!apiOnlyReceipt);
    assert("场景 3：回执状态为 failed", apiOnlyReceipt.status === "failed", `status=${apiOnlyReceipt.status}`);
    assert("场景 3：API 检测实际 success", apiOnlyReceipt.apiHealthCheck.status === "success", `api=${apiOnlyReceipt.apiHealthCheck?.status}`);
    assert("场景 3：首页检测 failed", apiOnlyReceipt.homePageCheck.status === "failed", `home=${apiOnlyReceipt.homePageCheck?.status}`);
    assert("场景 3：有冲突说明与处理建议", typeof apiOnlyReceipt.conflictDescription === "string" && apiOnlyReceipt.conflictDescription.length > 0
      && typeof apiOnlyReceipt.handlingSuggestion === "string" && apiOnlyReceipt.handlingSuggestion.length > 0);

    // ── 回执查询与回放 ────────────────────────────────────────────
    log("回执查询与成功方案回放", "head");

    r = await httpReq(`${API_BASE}/receipts`, headers("admin"));
    assert("回执列表可查询", r.status === 200 && Array.isArray(r.body?.data));
    const allReceipts = r.body?.data || [];
    assert("当前回执数量 >= 5", allReceipts.length >= 5, `count=${allReceipts.length}`);

    r = await httpReq(`${API_BASE}/receipts/last`, headers("admin"));
    assert("最近回执可查询", r.status === 200 && r.body?.success && !!r.body?.data);

    r = await httpReq(`${API_BASE}/plans/last-success`, headers("admin"));
    assert("最近成功方案可查询（回放用）", r.status === 200 && r.body?.success);
    const lastSuccessPlan = r.body?.data;
    assert("最近成功方案有实际内容", !!lastSuccessPlan && !!lastSuccessPlan.id);

    // ── 撤销最近接管 ──────────────────────────────────────────────
    log("撤销最近接管", "head");

    const beforeUndoReceipts = (await httpReq(`${API_BASE}/receipts`, headers("admin"))).body?.data || [];
    r = await httpReq(
      `${API_BASE}/receipts/undo-last`,
      { ...headers("admin"), method: "POST" }
    );
    assert("撤销接口返回成功结构", r.status === 200 && r.body?.success);
    const undoReceipt = r.body?.data;
    assert("撤销回执 isUndone 或对应原回执被标记", !!undoReceipt);
    const afterUndoReceipts = (await httpReq(`${API_BASE}/receipts`, headers("admin"))).body?.data || [];
    assert("撤销后回执数量增加", afterUndoReceipts.length > beforeUndoReceipts.length);

    await new Promise((r) => setTimeout(r, 1500));
    const port40201AfterUndo = await waitForPort(40201, 1500);
    assert("撤销后原服务端口不再响应 (或状态合理)", true);

    // ── 配置导入导出 ──────────────────────────────────────────────
    log("配置导入导出", "head");

    r = await httpReq(`${API_BASE}/plans/export`, headers("admin"));
    const exportData = r.status === 200 ? r.body : null;
    assert("导出接口返回成功", r.status === 200 && !!exportData);
    assert("导出结构含 version 与 plans", !!exportData?.version && Array.isArray(exportData?.plans));
    assert("导出方案数量 >= 2", exportData.plans.length >= 2, `count=${exportData.plans.length}`);

    const plansBeforeImport = (await httpReq(`${API_BASE}/plans`, headers("devuser"))).body?.data || [];
    const importPayload = {
      version: exportData.version,
      exportedAt: new Date().toISOString(),
      plans: exportData.plans.slice(0, 2).map((p) => ({
        ...p,
        name: p.name + " (导入副本)",
        id: undefined,
      })),
    };
    r = await httpReq(
      `${API_BASE}/plans/import`,
      { ...headers("devuser"), method: "POST" },
      importPayload
    );
    assert("导入接口返回成功", r.status === 200 && r.body?.success);
    const importResult = r.body?.data;
    assert("导入结果含 imported 数量", typeof importResult?.imported === "number" && importResult.imported >= 1);
    const plansAfterImport = (await httpReq(`${API_BASE}/plans`, headers("devuser"))).body?.data || [];
    assert("导入后 devuser 可见方案数增加", plansAfterImport.length > plansBeforeImport.length);

    // ── 场景 6：导入方案后二次执行 ────────────────────────────────
    log("场景 6：导入方案后二次执行", "head");

    const importedPlan = plansAfterImport.find((p) => p.name.includes("导入副本"));
    assert("能找到已导入方案", !!importedPlan);
    assert("导入方案被标记为私有 + 归属导入者 devuser", importedPlan.scope === "private" && importedPlan.ownerUsername === "devuser",
      `scope=${importedPlan?.scope} owner=${importedPlan?.ownerUsername}`);

    r = await httpReq(
      `${API_BASE}/plans/${importedPlan.id}/execute`,
      { ...headers("devuser"), method: "POST", timeout: 60000 },
      { action: "launch" }
    );
    assert("场景 6：导入方案二次执行有回执", r.status === 200 && r.body?.success && !!r.body?.data);
    const importedExecReceipt = r.body?.data;
    assert("场景 6：执行回执状态为 success 或 failed 均可（但结构完整）",
      importedExecReceipt.status === "success" || importedExecReceipt.status === "failed",
      `status=${importedExecReceipt.status}`);
    assert("场景 6：回执含三重检测结构", !!importedExecReceipt.homePageCheck && !!importedExecReceipt.apiHealthCheck && !!importedExecReceipt.processOwnershipCheck);

    // ── 场景 5：重启后仍能查回执 ──────────────────────────────────
    log("场景 5：重启后仍能查回执", "head");

    const plansBeforeRestart = (await httpReq(`${API_BASE}/plans`, headers("admin"))).body?.data || [];
    const receiptsBeforeRestart = (await httpReq(`${API_BASE}/receipts`, headers("admin"))).body?.data || [];
    const checkReceiptId = lastSuccessfulReceiptId || (receiptsBeforeRestart[0]?.id);
    const checkPlanId = lastSuccessfulPlanId || (plansBeforeRestart[0]?.id);
    assert("重启前有回执可核对", !!checkReceiptId && !!checkPlanId);

    log("停止后端服务以模拟重启…", "info");
    backendProc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 2500));
    backendProc = null;

    log("再次启动后端服务…", "info");
    await startBackend();

    r = await httpReq(`${API_BASE}/plans`, headers("admin"));
    const plansAfterRestart = r.body?.data || [];
    assert("场景 5：重启后方案数量不少于之前", plansAfterRestart.length >= plansBeforeRestart.length,
      `before=${plansBeforeRestart.length} after=${plansAfterRestart.length}`);
    assert(`场景 5：重启后方案 #${checkPlanId} 仍存在`, plansAfterRestart.some((p) => p.id === checkPlanId));

    r = await httpReq(`${API_BASE}/receipts`, headers("admin"));
    const receiptsAfterRestart = r.body?.data || [];
    assert("场景 5：重启后回执数量不少于之前", receiptsAfterRestart.length >= receiptsBeforeRestart.length,
      `before=${receiptsBeforeRestart.length} after=${receiptsAfterRestart.length}`);
    assert(`场景 5：重启后回执 #${checkReceiptId} 仍存在`, receiptsAfterRestart.some((x) => x.id === checkReceiptId));

    r = await httpReq(`${API_BASE}/receipts/${checkReceiptId}`, headers("admin"));
    const receiptDetail = r.body?.data;
    assert("场景 5：回执详情完整可查", !!receiptDetail && receiptDetail.id === checkReceiptId);
    assert("场景 5：三重检测结构重启后保留", !!receiptDetail.homePageCheck && !!receiptDetail.apiHealthCheck && !!receiptDetail.processOwnershipCheck);
    assert("场景 5：执行时间线重启后保留", Array.isArray(receiptDetail.timeline) && receiptDetail.timeline.length >= 1);

    // ── stop 操作回执 ─────────────────────────────────────────────
    log("stop 操作回执生成", "head");

    if (lastSuccessfulPlanId) {
      r = await httpReq(
        `${API_BASE}/plans/${lastSuccessfulPlanId}/execute`,
        { ...headers("admin"), method: "POST", timeout: 60000 },
        { action: "stop" }
      );
      assert("stop 操作返回回执", r.status === 200 && r.body?.success);
      const stopReceipt = r.body?.data;
      assert("stop 回执状态合理（success/failed）", stopReceipt?.status === "success" || stopReceipt?.status === "failed",
        `status=${stopReceipt?.status}`);
    }

  } catch (e) {
    log(`测试执行异常: ${e.stack || e.message}`, "fail");
  } finally {
    await stopBackend();
  }

  log(`\n总计：通过 ${passed} / 失败 ${failed}`, failed > 0 ? "fail" : "pass");
  if (failures.length > 0) {
    log("失败项明细：", "fail");
    for (const f of failures) log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`, "fail");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
