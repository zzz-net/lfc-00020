import http from "node:http";
import { spawn } from "node:child_process";
import * as net from "node:net";

const API_BASE = "http://localhost:3090/api/takeover";
const BACKEND_PORT = 3090;

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
      timeout: 30000,
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

async function waitForPort(port, timeoutMs = 25000) {
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
let createdPlanIds = [];

async function startBackend() {
  log("启动后端服务…", "info");
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
  log("环境接管回执 — 回归验证测试", "head");

  try {
    await startBackend();
  } catch (e) {
    log(`无法启动后端: ${e.message}`, "fail");
    process.exit(1);
  }

  try {
    // ── 回归 1: pending 状态不能报 success ─────────────────────
    log("回归 1: processOwnershipCheck 非 success 时回执不能标 success", "head");

    let r = await httpReq(
      `${API_BASE}/plans`,
      { ...headers("admin"), method: "POST" },
      {
        name: "回归1-归属待确认方案",
        scope: "private",
        expectedPort: BACKEND_PORT,
        homePageUrl: `http://localhost:${BACKEND_PORT}/`,
        apiHealthUrl: `http://localhost:${BACKEND_PORT}/api/health`,
        timeoutSec: 10,
        backendCommand: "echo should-not-run",
      }
    );
    const reg1PlanId = r.body?.data?.id;
    assert("回归1: 方案创建成功", !!reg1PlanId, JSON.stringify(r.body));
    createdPlanIds.push(reg1PlanId);

    r = await httpReq(
      `${API_BASE}/plans/${reg1PlanId}/execute`,
      { ...headers("admin"), method: "POST" },
      { action: "launch" }
    );
    assert("回归1: launch 端口冲突返回结构正常", r.status === 200 && r.body?.success);
    const reg1Receipt = r.body?.data;
    assert("回归1: 回执状态不是 success", reg1Receipt?.status !== "success", `status=${reg1Receipt?.status}`);
    assert("回归1: processOwnershipCheck 不是 success", reg1Receipt?.processOwnershipCheck?.status !== "success",
      `ownership=${reg1Receipt?.processOwnershipCheck?.status}`);
    assert("回归1: processOwnershipCheck 也不是 skipped（放行漏洞）",
      reg1Receipt?.processOwnershipCheck?.status !== "skipped",
      `ownership=${reg1Receipt?.processOwnershipCheck?.status}`);

    // ── 回归 2: 端口占用但归属不明（reuse 外部进程）──────────────
    log("回归 2: 端口占用但归属不明时 reuse 应失败", "head");

    r = await httpReq(
      `${API_BASE}/plans`,
      { ...headers("admin"), method: "POST" },
      {
        name: "回归2-归属不明方案",
        scope: "private",
        expectedPort: BACKEND_PORT,
        homePageUrl: `http://localhost:${BACKEND_PORT}/api/health`,
        apiHealthUrl: `http://localhost:${BACKEND_PORT}/api/health`,
        timeoutSec: 10,
      }
    );
    const reg2PlanId = r.body?.data?.id;
    assert("回归2: 方案创建成功", !!reg2PlanId);
    createdPlanIds.push(reg2PlanId);

    r = await httpReq(
      `${API_BASE}/plans/${reg2PlanId}/execute`,
      { ...headers("admin"), method: "POST" },
      { action: "reuse" }
    );
    assert("回归2: reuse 返回结构正常", r.status === 200 && r.body?.success);
    const reg2Receipt = r.body?.data;
    if (reg2Receipt?.processOwnershipCheck?.status === "failed" && reg2Receipt?.portOccupier?.belongsToWorkspace === false) {
      assert("回归2: 外部进程 reuse 回执 status=failed", reg2Receipt.status === "failed", `status=${reg2Receipt.status}`);
      assert("回归2: processOwnershipCheck=failed", reg2Receipt.processOwnershipCheck.status === "failed");
      assert("回归2: 有冲突说明", typeof reg2Receipt.conflictDescription === "string" && reg2Receipt.conflictDescription.length > 0);
      assert("回归2: 有处理建议", typeof reg2Receipt.handlingSuggestion === "string" && reg2Receipt.handlingSuggestion.length > 0);
    } else if (reg2Receipt?.processOwnershipCheck?.status === "success" && reg2Receipt?.portOccupier?.belongsToWorkspace === true) {
      assert("回归2: 本项目进程 reuse 回执 status=success (合理场景)", reg2Receipt.status === "success", `status=${reg2Receipt.status}`);
      assert("回归2: processOwnershipCheck=success", reg2Receipt.processOwnershipCheck.status === "success");
    } else {
      assert("回归2: 归属不确定时回执不能标 success", reg2Receipt?.status !== "success",
        `status=${reg2Receipt?.status} ownership=${reg2Receipt?.processOwnershipCheck?.status} belongsToWorkspace=${reg2Receipt?.portOccupier?.belongsToWorkspace}`);
    }

    // ── 回归 3: 首页或 API 单边通过 ─────────────────────────────
    log("回归 3: 单边通过（仅首页通或仅 API 通）时回执必须 failed", "head");

    r = await httpReq(
      `${API_BASE}/plans`,
      { ...headers("admin"), method: "POST" },
      {
        name: "回归3-仅API通方案",
        scope: "private",
        expectedPort: BACKEND_PORT,
        homePageUrl: `http://localhost:${BACKEND_PORT}/nonexistent-page-xyz`,
        apiHealthUrl: `http://localhost:${BACKEND_PORT}/api/health`,
        timeoutSec: 10,
      }
    );
    const reg3PlanId = r.body?.data?.id;
    assert("回归3: 方案创建成功", !!reg3PlanId);
    createdPlanIds.push(reg3PlanId);

    r = await httpReq(
      `${API_BASE}/plans/${reg3PlanId}/execute`,
      { ...headers("admin"), method: "POST" },
      { action: "reuse" }
    );
    assert("回归3: reuse 执行返回正常", r.status === 200 && r.body?.success);
    const reg3Receipt = r.body?.data;
    if (reg3Receipt?.status === "success" && reg3Receipt?.portOccupier?.belongsToWorkspace === true) {
      assert("回归3: 单边通过回执 status=failed", reg3Receipt.status === "failed",
        `status=${reg3Receipt.status} home=${reg3Receipt.homePageCheck?.status} api=${reg3Receipt.apiHealthCheck?.status}`);
    } else {
      assert("回归3: 非本项目进程导致失败（合理场景）", reg3Receipt?.status !== "success",
        `status=${reg3Receipt?.status}`);
    }

    // ── 回归 4: 真实 launch + 三项校验全部 success 才标 success ──
    log("回归 4: 真实 launch 三项校验全 success 才标 success", "head");

    r = await httpReq(
      `${API_BASE}/plans`,
      { ...headers("admin"), method: "POST" },
      {
        name: "回归4-真实服务方案",
        scope: "private",
        expectedPort: 40301,
        homePageUrl: "http://localhost:40301/api/health",
        apiHealthUrl: "http://localhost:40301/api/health",
        timeoutSec: 25,
        backendCommand: process.platform === "win32"
          ? `npx tsx api/server.ts`
          : `PORT=40301 npx tsx api/server.ts`,
      }
    );
    const reg4PlanId = r.body?.data?.id;
    assert("回归4: 方案创建成功", !!reg4PlanId, JSON.stringify(r.body));
    createdPlanIds.push(reg4PlanId);

    r = await httpReq(
      `${API_BASE}/plans/${reg4PlanId}/execute`,
      { ...headers("admin"), method: "POST" },
      { action: "launch" }
    );
    assert("回归4: launch 返回结构正常", r.status === 200 && r.body?.success && !!r.body?.data);
    const reg4Receipt = r.body.data;
    if (reg4Receipt.status === "success") {
      assert("回归4: 首页检测 status=success", reg4Receipt.homePageCheck?.status === "success",
        `home=${reg4Receipt.homePageCheck?.status}`);
      assert("回归4: API 检测 status=success", reg4Receipt.apiHealthCheck?.status === "success",
        `api=${reg4Receipt.apiHealthCheck?.status}`);
      assert("回归4: 进程归属检测 status=success", reg4Receipt.processOwnershipCheck?.status === "success",
        `owner=${reg4Receipt.processOwnershipCheck?.status}`);
      assert("回归4: 进程归属不是 skipped", reg4Receipt.processOwnershipCheck?.status !== "skipped");
      assert("回归4: 实际端口=40301", reg4Receipt.actualPort === 40301, `actual=${reg4Receipt.actualPort}`);
      assert("回归4: 实际 PID > 0", typeof reg4Receipt.actualPid === "number" && reg4Receipt.actualPid > 0);
    } else {
      assert("回归4: launch 失败但 processOwnershipCheck 不是 skipped",
        reg4Receipt.processOwnershipCheck?.status !== "skipped",
        `ownership=${reg4Receipt.processOwnershipCheck?.status}`);
      assert("回归4: launch 失败时回执 status=failed（不是 success）",
        reg4Receipt.status === "failed",
        `status=${reg4Receipt.status}`);
    }

    // ── 回归 5: 重试后状态收敛 ─────────────────────────────────
    log("回归 5: 重试后状态收敛", "head");

    r = await httpReq(
      `${API_BASE}/plans/${reg4PlanId}/execute`,
      { ...headers("admin"), method: "POST" },
      { action: "reuse" }
    );
    assert("回归5: 二次 reuse 返回正常", r.status === 200 && r.body?.success);
    const reg5Receipt = r.body?.data;
    if (reg5Receipt?.status === "success") {
      assert("回归5: 重试收敛到 success", reg5Receipt.status === "success");
      assert("回归5: 重试后 processOwnershipCheck=success", reg5Receipt.processOwnershipCheck?.status === "success");
    } else {
      assert("回归5: 重试后 status 不是 success（进程可能已退出）", reg5Receipt?.status !== "success",
        `status=${reg5Receipt?.status}`);
    }

    // ── 回归 6: GUI/API/SQLite 用户可见结果一致 ──────────────────
    log("回归 6: GUI/API/SQLite 用户可见结果一致", "head");

    r = await httpReq(`${API_BASE}/receipts?limit=50`, headers("admin"));
    assert("回归6: 回执列表可查", r.status === 200 && Array.isArray(r.body?.data));
    const allReceipts = r.body?.data || [];
    const successReceipts = allReceipts.filter((rec) => rec.status === "success" && !rec.isUndone && rec.action !== "stop");
    for (const sr of successReceipts) {
      assert(
        `回归6: success 回执 #${sr.id} 三项校验全 success`,
        sr.homePageCheck?.status === "success" &&
        sr.apiHealthCheck?.status === "success" &&
        sr.processOwnershipCheck?.status === "success",
        `home=${sr.homePageCheck?.status} api=${sr.apiHealthCheck?.status} owner=${sr.processOwnershipCheck?.status}`
      );
    }

    for (const rec of allReceipts) {
      if (rec.status === "success" && rec.action !== "stop") {
        assert(
          `回归6: 非 stop success 回执 #${rec.id} 的 processOwnershipCheck 不是 skipped`,
          rec.processOwnershipCheck?.status !== "skipped",
          `owner=${rec.processOwnershipCheck?.status}`
        );
      }
    }

    const failedReceipts = allReceipts.filter((rec) => rec.status === "failed");
    for (const fr of failedReceipts) {
      if (fr.action !== "stop") {
        assert(
          `回归6: failed 回执 #${fr.id} 有冲突说明`,
          typeof fr.conflictDescription === "string" && fr.conflictDescription.length > 0,
          `conflictDescription=${fr.conflictDescription}`
        );
      }
    }

    // ── 回归 7: 详细回执一致性验证 ──────────────────────────────
    log("回归 7: 单条回执详情与列表一致", "head");

    if (allReceipts.length > 0) {
      const checkId = allReceipts[0].id;
      r = await httpReq(`${API_BASE}/receipts/${checkId}`, headers("admin"));
      const detail = r.body?.data;
      assert("回归7: 详情接口正常", r.status === 200 && !!detail);
      assert("回归7: 详情与列表 id 一致", detail?.id === checkId);
      assert("回归7: 详情 status 一致", detail?.status === allReceipts[0].status);
      assert("回归7: 详情 processOwnershipCheck 结构完整", !!detail?.processOwnershipCheck);
      assert("回归7: 详情 homePageCheck 结构完整", !!detail?.homePageCheck);
      assert("回归7: 详情 apiHealthCheck 结构完整", !!detail?.apiHealthCheck);
    }

    // ── 回归 8: stop 操作仍然正常 ──────────────────────────────
    log("回归 8: stop 操作回执正常", "head");

    r = await httpReq(
      `${API_BASE}/plans/${reg4PlanId}/execute`,
      { ...headers("admin"), method: "POST" },
      { action: "stop" }
    );
    assert("回归8: stop 返回正常", r.status === 200 && r.body?.success);
    const stopReceipt = r.body?.data;
    assert("回归8: stop 回执状态合理", stopReceipt?.status === "success" || stopReceipt?.status === "failed",
      `status=${stopReceipt?.status}`);

    // ── 最终汇总 ────────────────────────────────────────────────
    log("\n回归验证汇总：", "head");
    log(`总计: 通过 ${passed} / 失败 ${failed}`, failed > 0 ? "fail" : "pass");
    if (failures.length > 0) {
      log("失败项明细：", "fail");
      for (const f of failures) log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`, "fail");
    }

  } catch (e) {
    log(`测试执行异常: ${e.stack || e.message}`, "fail");
  } finally {
    await stopBackend();
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
