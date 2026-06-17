import http from "node:http";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as net from "node:net";

const API_BASE = "http://localhost:3088/api/devworkbench";
const BACKEND_PORT = 3088;

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
      timeout: 15000,
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

async function waitForPort(port, timeoutMs = 15000) {
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
  const scriptPath = path.resolve("api/server.ts");
  backendProc = spawn("npx", ["tsx", scriptPath], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(BACKEND_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  backendProc.stdout.on("data", (d) => process.stdout.write(`[backend] ${d}`));
  backendProc.stderr.on("data", (d) => process.stderr.write(`[backend-err] ${d}`));
  const ok = await waitForPort(BACKEND_PORT, 20000);
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
  log("启动配置与验真工作台 — 集成测试", "head");

  try {
    await startBackend();
  } catch (e) {
    log(`无法启动后端: ${e.message}`, "fail");
    process.exit(1);
  }

  try {
    // ── 基础用户信息 ──────────────────────────────────────────────
    log("用户与权限", "head");

    let r = await httpReq(`${API_BASE}/users/me`, headers("admin"));
    assert("admin 获取自己信息成功", r.status === 200 && r.body?.success, `status=${r.status}`);
    assert("admin role=admin", r.body?.data?.role === "admin", JSON.stringify(r.body?.data));

    r = await httpReq(`${API_BASE}/users/me`, headers("devuser"));
    assert("devuser 获取自己信息成功", r.status === 200 && r.body?.success);
    assert("devuser role=user", r.body?.data?.role === "user");

    r = await httpReq(`${API_BASE}/users`, headers("admin"));
    assert("admin 可列出所有用户", r.status === 200 && r.body?.success);

    r = await httpReq(`${API_BASE}/users`, headers("devuser"));
    assert("devuser 不能列出所有用户 (403)", r.status === 403);

    // ── 配置 CRUD ─────────────────────────────────────────────────
    log("配置 CRUD 与权限差异", "head");

    r = await httpReq(`${API_BASE}/configs`, headers("admin"));
    const adminConfigs = r.body?.data || [];
    assert("admin 列出配置成功", r.status === 200 && Array.isArray(adminConfigs));
    assert("初始配置至少 2 个公共 + 1 个私有", adminConfigs.length >= 3, `count=${adminConfigs.length}`);

    const publicCfg = adminConfigs.find((c) => c.scope === "public");
    const devuserPrivateCfg = adminConfigs.find((c) => c.scope === "private" && c.ownerUsername === "devuser");
    assert("存在公共配置", !!publicCfg);
    assert("存在 devuser 私有配置", !!devuserPrivateCfg);

    r = await httpReq(`${API_BASE}/configs`, headers("devuser"));
    const devuserCfgs = r.body?.data || [];
    assert("devuser 能看到公共配置", devuserCfgs.some((c) => c.scope === "public"));
    assert("devuser 能看到自己的私有配置", devuserCfgs.some((c) => c.ownerUsername === "devuser"));

    r = await httpReq(
      `${API_BASE}/configs`,
      { ...headers("devuser"), method: "POST" },
      {
        name: "devuser 测试配置",
        scope: "public",
        serviceType: "backend",
        command: "echo test",
        cwd: process.cwd(),
        fixedPort: 39999,
        healthCheckUrl: "http://localhost:39999/api/health",
        startupTimeoutSec: 5,
      }
    );
    assert("devuser 不能创建公共配置 (403)", r.status === 403);

    r = await httpReq(
      `${API_BASE}/configs`,
      { ...headers("devuser"), method: "POST" },
      {
        name: "devuser 私有配置 2",
        scope: "private",
        serviceType: "backend",
        command: "echo test",
        cwd: process.cwd(),
        fixedPort: 39998,
        healthCheckUrl: "http://localhost:39998/api/health",
        startupTimeoutSec: 5,
      }
    );
    assert("devuser 可以创建私有配置 (201)", r.status === 201 && r.body?.success);
    const newPrivateCfgId = r.body?.data?.id;
    assert("新配置 ID 已返回", !!newPrivateCfgId);

    r = await httpReq(
      `${API_BASE}/configs/${publicCfg.id}`,
      { ...headers("devuser"), method: "PUT" },
      { name: "被篡改" }
    );
    assert("devuser 不能修改公共配置 (403)", r.status === 403);

    r = await httpReq(
      `${API_BASE}/configs/${publicCfg.id}`,
      { ...headers("admin"), method: "PUT" },
      { name: publicCfg.name + " (已改)" }
    );
    assert("admin 可以修改公共配置", r.status === 200 && r.body?.success);
    assert("公共配置名称已更新", r.body?.data?.name === publicCfg.name + " (已改)");

    r = await httpReq(
      `${API_BASE}/configs/${publicCfg.id}`,
      { ...headers("admin"), method: "PUT" },
      { name: publicCfg.name }
    );
    assert("恢复公共配置名称成功", r.body?.data?.name === publicCfg.name);

    r = await httpReq(
      `${API_BASE}/configs/${newPrivateCfgId}`,
      { ...headers("devuser"), method: "DELETE" }
    );
    assert("devuser 可以删除自己的私有配置", r.status === 200 && r.body?.success);

    // ── 端口检测 ──────────────────────────────────────────────────
    log("端口冲突拦截", "head");

    r = await httpReq(`${API_BASE}/ports/39997/check`, headers("admin"));
    assert("空闲端口检测返回可用", r.body?.data?.isAvailable === true, `port=39997 resp=${JSON.stringify(r.body)}`);

    r = await httpReq(`${API_BASE}/ports/${BACKEND_PORT}/check`, headers("admin"));
    assert("已占用端口检测返回不可用", r.body?.data?.isAvailable === false, `port=${BACKEND_PORT} resp=${JSON.stringify(r.body)}`);
    assert("冲突提示包含建议文字", typeof r.body?.data?.suggestion === "string" && r.body.data.suggestion.length > 0);

    // ── 启动并验真：固定端口生效 ──────────────────────────────────
    log("场景 1：固定端口生效 + 验真通过", "head");

    r = await httpReq(
      `${API_BASE}/configs`,
      { ...headers("admin"), method: "POST" },
      {
        name: "测试-后端真服务",
        scope: "private",
        ownerUsername: "admin",
        serviceType: "backend",
        command: process.platform === "win32"
          ? `npx tsx api/server.ts`
          : `PORT=40001 npx tsx api/server.ts`,
        cwd: process.cwd(),
        fixedPort: 40001,
        healthCheckUrl: "http://localhost:40001/api/health",
        startupTimeoutSec: 25,
      }
    );
    const backendCfgId = r.body?.data?.id;
    assert("测试后端配置已创建", !!backendCfgId, JSON.stringify(r.body));

    log("触发启动并验真（请稍候，最长 30 秒）…", "info");
    r = await httpReq(
      `${API_BASE}/configs/${backendCfgId}/launch`,
      { ...headers("admin"), method: "POST" }
    );
    const verifyRec = r.body?.data;
    assert("启动接口返回成功结构", r.status === 200 && r.body?.success && !!verifyRec);
    assert("验真记录写入 actualPort=配置的 fixedPort (40001)", verifyRec.actualPort === 40001, `actual=${verifyRec.actualPort}`);
    assert("验真记录 pid > 0", typeof verifyRec.pid === "number" && verifyRec.pid > 0, `pid=${verifyRec.pid}`);
    assert("后端服务启动后 apiCheckStatus=success", verifyRec.apiCheckStatus === "success", `status=${verifyRec.apiCheckStatus}`);
    assert("后端服务 pageCheckStatus=success (跳过自动通过)", verifyRec.pageCheckStatus === "success");
    assert("最终 status=success", verifyRec.status === "success", `final=${verifyRec.status}`);
    assert("时间线至少 4 个事件", Array.isArray(verifyRec.timeline) && verifyRec.timeline.length >= 4);
    const healthRsp = await httpReq("http://localhost:40001/api/health", {});
    assert("服务实际在 40001 端口响应 200", healthRsp.status === 200 && healthRsp.body?.message === "ok");

    // ── 场景 2：端口冲突拦截启动 ───────────────────────────────────
    log("场景 2：端口冲突拦截启动", "head");

    r = await httpReq(
      `${API_BASE}/configs`,
      { ...headers("admin"), method: "POST" },
      {
        name: "测试-冲突端口",
        scope: "private",
        serviceType: "backend",
        command: "echo should-not-run",
        cwd: process.cwd(),
        fixedPort: 40001,
        healthCheckUrl: "http://localhost:40001/api/health",
        startupTimeoutSec: 5,
      }
    );
    const conflictCfgId = r.body?.data?.id;
    assert("冲突配置已创建", !!conflictCfgId);

    r = await httpReq(
      `${API_BASE}/configs/${conflictCfgId}/launch`,
      { ...headers("admin"), method: "POST" }
    );
    const conflictRec = r.body?.data;
    assert("冲突启动接口正常返回", r.status === 200 && r.body?.success);
    assert("冲突启动最终状态为 failed", conflictRec.status === "failed", `status=${conflictRec.status}`);
    assert("failureReason 包含端口占用描述", /端口.*已被占用/.test(conflictRec.failureReason || ""), conflictRec.failureReason);
    assert("冲突启动不会生成有效 pid", !conflictRec.pid || conflictRec.pid === 0 || conflictRec.pid == null, `pid=${conflictRec.pid}`);

    // ── 场景 3：套用上次成功配置 ──────────────────────────────────
    log("场景 3：一键套用上次成功配置", "head");

    r = await httpReq(`${API_BASE}/configs/last-success?serviceType=backend`, headers("admin"));
    const lastSuccess = r.body?.data;
    assert("能查询到上次成功的后端配置", !!lastSuccess, JSON.stringify(r.body));
    assert("上次成功配置端口为 40001", lastSuccess.fixedPort === 40001, `port=${lastSuccess.fixedPort}`);

    r = await httpReq(
      `${API_BASE}/configs`,
      { ...headers("admin"), method: "POST" },
      {
        name: lastSuccess.name + " (副本)",
        scope: "private",
        serviceType: lastSuccess.serviceType,
        command: lastSuccess.command,
        cwd: lastSuccess.cwd,
        fixedPort: 40002,
        healthCheckUrl: "http://localhost:40002/api/health",
        startupTimeoutSec: lastSuccess.startupTimeoutSec,
      }
    );
    assert("基于上次成功配置创建副本成功", r.status === 201 && r.body?.success);

    // ── 场景 4：重启后记录保留 ────────────────────────────────────
    log("场景 4：服务重启后记录与配置保留", "head");

    const beforeCfgCount = adminConfigs.length;
    const beforeRecRsp = await httpReq(`${API_BASE}/verifications`, headers("admin"));
    const beforeRecCount = (beforeRecRsp.body?.data || []).length;
    assert("重启前已有验真记录", beforeRecCount >= 2, `count=${beforeRecCount}`);

    log("先保存验证记录ID以便核对…", "info");
    const recId = verifyRec.id;
    const cfgIdKeep = backendCfgId;

    log("停止后端服务以模拟重启", "info");
    const testServerPid = backendProc.pid;
    const testExtraPid = verifyRec.pid;
    backendProc.kill("SIGTERM");
    try {
      if (testExtraPid && testExtraPid !== testServerPid) {
        process.kill(testExtraPid, "SIGTERM");
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 2500));
    backendProc = null;

    log("再次启动后端服务", "info");
    await startBackend();

    r = await httpReq(`${API_BASE}/configs`, headers("admin"));
    assert("重启后配置数量一致", (r.body?.data || []).length >= beforeCfgCount);
    assert(`重启后配置 #${cfgIdKeep} 仍存在`, (r.body?.data || []).some((c) => c.id === cfgIdKeep));

    r = await httpReq(`${API_BASE}/verifications`, headers("admin"));
    const afterRecs = r.body?.data || [];
    assert("重启后验真记录数量不少于之前", afterRecs.length >= beforeRecCount, `before=${beforeRecCount} after=${afterRecs.length}`);
    assert(`重启后验真记录 #${recId} 仍存在`, afterRecs.some((x) => x.id === recId));

    r = await httpReq(`${API_BASE}/verifications/${recId}`, headers("admin"));
    const recAfter = r.body?.data;
    assert("重启后验真记录详情完整", !!recAfter && recAfter.status === "success" && recAfter.actualPort === 40001);
    assert("重启后时间线仍然保留", Array.isArray(recAfter.timeline) && recAfter.timeline.length >= 4);

    // ── 管理员停止进程权限 ────────────────────────────────────────
    log("管理员停止进程权限", "head");

    const testPid = verifyRec.pid;
    r = await httpReq(`${API_BASE}/processes/${testPid}/stop`, { ...headers("devuser"), method: "POST" });
    assert("devuser 无权停止进程 (403)", r.status === 403);

    r = await httpReq(`${API_BASE}/processes`, headers("devuser"));
    assert("devuser 无权列出进程 (403)", r.status === 403);

    r = await httpReq(`${API_BASE}/processes`, headers("admin"));
    assert("admin 可列出进程", r.status === 200 && r.body?.success);

    r = await httpReq(`${API_BASE}/processes/${testPid}/stop`, { ...headers("admin"), method: "POST" });
    assert("admin 有权停止进程", r.status === 200);

    await new Promise((r) => setTimeout(r, 1500));
    const stillAlive = await waitForPort(40001, 1500);
    assert("管理员停止后 40001 端口不再响应", !stillAlive);
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
